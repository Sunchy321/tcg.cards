import { AwsClient } from 'aws4fetch';
import { z } from 'zod';
import { gameDataPermission } from '@tcg-cards/auth';

import { getAuth } from './auth';

import type { InternalServiceEnv } from './env';

/** Lifetime of one signed upload URL. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/** Hard limits that keep one publication from becoming an unbounded upload. */
const MAX_OBJECTS = 64;
const MAX_OBJECT_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const searchGame = z.enum(['magic', 'hearthstone']);

/** One object a publication wants to write into the search bucket. */
const publishObject = z.strictObject({
  key:    z.string().trim().min(1),
  bytes:  z.number().int().positive().max(MAX_OBJECT_BYTES),
  sha256: sha256.optional(),
});

export const searchPublishRequest = z.strictObject({
  game:    searchGame,
  objects: z.array(publishObject).min(1).max(MAX_OBJECTS),
});

export type SearchPublishRequest = z.infer<typeof searchPublishRequest>;
export type SearchPublishObject = z.infer<typeof publishObject>;

/** One signed upload the desktop performs directly against the bucket. */
export interface SignedUpload {
  key:     string;
  url:     string;
  /** Headers the client must send exactly as signed. */
  headers: Record<string, string>;
}

/** Normalizes the leading slash the manifest uses into a bucket key. */
export function normalizeObjectKey(key: string): string {
  return key.replace(/^\/+/, '');
}

/**
 * Reports whether one requested write belongs to the game's search prefix.
 * Package objects must be content addressed; the two manifest locations are
 * the only writable keys that are not.
 */
export function isAllowedSearchKey(game: 'magic' | 'hearthstone', object: SearchPublishObject): boolean {
  const key = normalizeObjectKey(object.key);
  const prefix = `search/${game}/`;
  if (key === `${prefix}manifest.json`) return true;
  if (new RegExp(`^${prefix}releases/[a-f0-9]{64}/manifest\\.json$`).test(key)) return true;
  const packageKey = new RegExp(`^${prefix}objects/([a-f0-9]{64})\\.sqlite$`).exec(key);
  return packageKey != null && object.sha256 != null && packageKey[1] === object.sha256;
}

/** Verifies that the requested set stays inside the configured limits. */
export function isWithinLimits(objects: SearchPublishObject[]): boolean {
  const total = objects.reduce((sum, object) => sum + object.bytes, 0);
  return total <= MAX_TOTAL_BYTES;
}

/** Signs one direct upload URL with the service's bucket credentials. */
async function signUpload(
  env: InternalServiceEnv,
  key: string,
  bytes: number,
): Promise<SignedUpload> {
  const client = new AwsClient({
    accessKeyId:     env.R2_S3_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY!,
    service:         's3',
    region:          'auto',
  });
  const url = new URL(
    `https://${env.R2_S3_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_DATA_BUCKET}/${key}`,
  );
  url.searchParams.set('X-Amz-Expires', String(UPLOAD_URL_TTL_SECONDS));

  const signature = await client.sign(url.toString(), {
    method:  'PUT',
    headers: { 'content-length': String(bytes) },
    aws:     { signQuery: true, allHeaders: true },
  });
  return {
    key,
    url:     signature.url,
    headers: { 'content-length': String(bytes) },
  };
}

/** Admits the caller and confirms its per-game data permission. */
async function admission(
  env: InternalServiceEnv,
  headers: Headers,
  game: 'magic' | 'hearthstone',
  origin: string,
) {
  const auth = getAuth(env, { baseURL: origin });
  const session = await auth.api.getSession({ headers });
  if (session?.session == null) return 401;
  return gameDataPermission(session.user.role, game) ? null : 403;
}

/**
 * Admits one search publication and signs the uploads it still needs.
 * Objects already present with the expected size are reported as existing so
 * the desktop can skip re-uploading identical content-addressed packages.
 */
export async function signSearchUploads(
  env: InternalServiceEnv,
  headers: Headers,
  origin: string,
  input: SearchPublishRequest,
): Promise<{ status: number, body: Record<string, unknown> }> {
  const denied = await admission(env, headers, input.game, origin);
  if (denied) return { status: denied, body: { allowed: false, message: denied === 401 ? '请先登录控制台服务。' : '当前账号没有发布该游戏数据的权限。' } };

  if (!env.R2_S3_ACCOUNT_ID || !env.R2_S3_ACCESS_KEY_ID || !env.R2_S3_SECRET_ACCESS_KEY) {
    return { status: 503, body: { allowed: false, message: '服务未配置搜索数据上传签发。' } };
  }
  if (!isWithinLimits(input.objects) || !input.objects.every(object => isAllowedSearchKey(input.game, object))) {
    return { status: 400, body: { allowed: false, message: '搜索数据发布请求无效。' } };
  }

  const uploads: SignedUpload[] = [];
  const existing: string[] = [];
  for (const object of input.objects) {
    const key = normalizeObjectKey(object.key);
    const head = await env.R2_DATA.head(key);
    if (head != null && head.size === object.bytes) {
      existing.push(key);
      continue;
    }
    uploads.push(await signUpload(env, key, object.bytes));
  }

  return { status: 200, body: { allowed: true, uploads, existing } };
}

/**
 * Reports which of the expected objects are not present at their expected size.
 * Integrity is not re-verified here: objects are content addressed and the
 * downloading client checks hashes before activating a release.
 */
export async function verifySearchObjects(
  env: InternalServiceEnv,
  headers: Headers,
  origin: string,
  input: SearchPublishRequest,
): Promise<{ status: number, body: Record<string, unknown> }> {
  const denied = await admission(env, headers, input.game, origin);
  if (denied) return { status: denied, body: { allowed: false, message: denied === 401 ? '请先登录控制台服务。' : '当前账号没有发布该游戏数据的权限。' } };

  if (!input.objects.every(object => isAllowedSearchKey(input.game, object))) {
    return { status: 400, body: { allowed: false, message: '搜索数据发布请求无效。' } };
  }

  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const object of input.objects) {
    const key = normalizeObjectKey(object.key);
    const head = await env.R2_DATA.head(key);
    if (head == null) missing.push(key);
    else if (head.size !== object.bytes) mismatched.push(key);
  }

  return { status: 200, body: { allowed: true, ok: missing.length === 0 && mismatched.length === 0, missing, mismatched } };
}
