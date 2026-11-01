import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { z } from 'zod';

import type { SearchPublicationGame, SearchPublicationManifest } from '@tcg-cards/model/search/publication';
import { searchPublicationManifest, validateSearchPublicationLocales } from '@tcg-cards/model/search/publication';

import { computeSearchReleaseHash, sha256File } from './manifest';
import type { SearchPackageFile } from './manifest';

const FIXED_MANIFEST_CACHE = 'public, max-age=300';
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export type SearchR2Target = {
  accountId:       string;
  accessKeyId:     string;
  secretAccessKey: string;
};

export type SearchR2PublishResult = {
  game:            SearchPublicationGame;
  releaseHash:     string;
  uploadedObjects: number;
  reusedObjects:   number;
  cleanedObjects:  number;
  cleanupWarnings: string[];
};

/** Publishes one game's package group; the mutable pointer is the final successful write. */
export async function publishSearchPackageGroup(input: {
  client:             S3Client;
  bucket:             string;
  manifest:           SearchPublicationManifest;
  files:              SearchPackageFile[];
  now?:               Date;
  signal?:            AbortSignal;
  onPackageComplete?: (done: number, total: number) => Promise<void> | void;
}): Promise<SearchR2PublishResult> {
  const manifest = validateSearchPublicationLocales(searchPublicationManifest.parse(input.manifest));
  const now = input.now ?? new Date();
  const prefix = `search/${manifest.game}`;
  const objectPaths = new Map(input.files.map(file => [normalizeKey(file.key), file]));
  const expectedKeys = new Set(manifest.packages.map(item => normalizeKey(item.key)));
  if (objectPaths.size !== input.files.length || objectPaths.size !== expectedKeys.size
    || [...expectedKeys].some(key => !objectPaths.has(key))) {
    throw new Error('The local search package files do not match the release manifest.');
  }

  const previous = await readFixedManifest(input.client, input.bucket, manifest.game);
  const nextKeys = new Set(manifest.packages.map(item => normalizeKey(item.key)));
  const previousKeys = new Set(previous?.packages.map(item => normalizeKey(item.key)) ?? []);
  let uploadedObjects = 0;
  let reusedObjects = 0;
  let completedObjects = 0;
  for (const descriptor of manifest.packages) {
    throwIfAborted(input.signal);
    const key = normalizeKey(descriptor.key);
    const file = objectPaths.get(key)!;
    await verifyLocalFile(file);
    if (await hasVerifiedObject(input.client, input.bucket, key, file)) {
      reusedObjects++;
      completedObjects++;
      await input.onPackageComplete?.(completedObjects, manifest.packages.length);
      continue;
    }
    const uploadBody = hashStream(file.path);
    const uploader = new Upload({
      client: input.client,
      params: {
        Bucket:       input.bucket,
        Key:          key,
        Body:         uploadBody.stream,
        ContentType:  'application/vnd.sqlite3',
        CacheControl: IMMUTABLE_CACHE,
        Metadata:     { sha256: file.sha256 },
      },
      queueSize:         2,
      partSize:          8 * 1024 * 1024,
      leavePartsOnError: false,
    });
    const abortUpload = () => {
      void uploader.abort().catch(() => {});
    };
    input.signal?.addEventListener('abort', abortUpload, { once: true });
    try {
      await uploader.done();
    } finally {
      input.signal?.removeEventListener('abort', abortUpload);
    }
    throwIfAborted(input.signal);
    const uploadedDigest = uploadBody.result();
    if (uploadedDigest.sha256 !== file.sha256 || uploadedDigest.bytes !== file.bytes) {
      await input.client.send(new DeleteObjectCommand({ Bucket: input.bucket, Key: key }));
      throw new Error(`The search package changed while it was being uploaded: ${file.path}`);
    }
    if (!await hasVerifiedObject(input.client, input.bucket, key, file)) {
      throw new Error(`R2 did not confirm the uploaded search object ${key}.`);
    }
    uploadedObjects++;
    completedObjects++;
    await input.onPackageComplete?.(completedObjects, manifest.packages.length);
  }

  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const immutableKey = `${prefix}/releases/${manifest.releaseHash}/manifest.json`;
  throwIfAborted(input.signal);
  const immutableBytes = await putImmutableManifest(input.client, input.bucket, immutableKey, bytes, manifest.releaseHash);

  // Begin retention only for objects that were referenced by the old pointer and
  // are absent from the complete candidate group. Clear any stale marker when an
  // object becomes active again so a later retirement receives a fresh 30 days.
  await updateRetirementRecords(
    input.client,
    input.bucket,
    manifest.game,
    [...previousKeys].filter(key => !nextKeys.has(key)),
    [...nextKeys],
    now,
  );

  const cleanupWarnings: string[] = [];

  // Cleanup uses both the old and next active groups as protected sets. Cleanup errors do not
  // prevent activation because retained objects are immutable and the mutable manifest is safe.
  let cleanedObjects = 0;
  try {
    cleanedObjects = await collectExpiredObjects(
      input.client,
      input.bucket,
      manifest.game,
      new Set([...nextKeys, ...previousKeys]),
      now,
    );
  } catch (error) {
    console.warn('[search-publication] Retired package cleanup could not finish.', error);
    cleanupWarnings.push('部分旧搜索文件暂未清理，可在下次发布时重试。');
  }

  throwIfAborted(input.signal);
  await input.client.send(new PutObjectCommand({
    Bucket:        input.bucket,
    Key:           `${prefix}/manifest.json`,
    Body:          immutableBytes,
    ContentLength: immutableBytes.byteLength,
    ContentType:   'application/json; charset=utf-8',
    CacheControl:  FIXED_MANIFEST_CACHE,
  }));

  return {
    game:        manifest.game,
    releaseHash: manifest.releaseHash,
    uploadedObjects,
    reusedObjects,
    cleanedObjects,
    cleanupWarnings,
  };
}

async function putImmutableManifest(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  releaseHash: string,
): Promise<Buffer> {
  try {
    const existing = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await existing.Body?.transformToString();
    if (text == null) throw new Error('The saved search release manifest has no body.');
    const manifest = searchPublicationManifest.parse(JSON.parse(text));
    if (manifest.releaseHash !== releaseHash || computeSearchReleaseHash(manifest) !== releaseHash) {
      throw new Error('The saved search release manifest does not match its content address.');
    }
    return Buffer.from(text);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  await client.send(new PutObjectCommand({
    Bucket:        bucket,
    Key:           key,
    Body:          body,
    ContentLength: body.byteLength,
    ContentType:   'application/json; charset=utf-8',
    CacheControl:  IMMUTABLE_CACHE,
  }));
  return body;
}

/** Creates the account-scoped S3-compatible R2 client used only inside desktop runtime. */
export function createSearchR2Client(target: SearchR2Target): S3Client {
  return new S3Client({
    region:      'auto',
    endpoint:    `https://${target.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     target.accessKeyId,
      secretAccessKey: target.secretAccessKey,
    },
  });
}

async function verifyLocalFile(file: SearchPackageFile): Promise<void> {
  const [digest, metadata] = await Promise.all([sha256File(file.path), stat(file.path)]);
  if (digest !== file.sha256 || metadata.size !== file.bytes) {
    throw new Error(`The local search package changed after its release manifest was created: ${file.path}`);
  }
}

function hashStream(path: string) {
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = createReadStream(path).pipe(new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.byteLength;
      callback(null, chunk);
    },
  }));
  return { stream, result: () => ({ sha256: hash.digest('hex'), bytes }) };
}

async function hasVerifiedObject(
  client: S3Client,
  bucket: string,
  key: string,
  file: Pick<SearchPackageFile, 'sha256' | 'bytes' | 'path'>,
): Promise<boolean> {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (head.ContentLength === file.bytes && head.Metadata?.sha256 === file.sha256) return true;
    // Objects from a pre-metadata publisher are read and checked before they are reused.
    if (head.ContentLength !== file.bytes) {
      throw new Error(`The existing content-addressed R2 object has an unexpected size: ${key}`);
    }
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (response.Body == null) return false;
    const hash = await hashBody(response.Body);
    if (hash !== file.sha256) {
      throw new Error(`The existing content-addressed R2 object failed its SHA-256 check: ${key}`);
    }
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

async function readFixedManifest(
  client: S3Client,
  bucket: string,
  game: SearchPublicationGame,
): Promise<SearchPublicationManifest | null> {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `search/${game}/manifest.json` }));
    const body = await response.Body?.transformToString();
    if (body == null) throw new Error('The current search manifest has no body.');
    const manifest = searchPublicationManifest.parse(JSON.parse(body));
    if (manifest.game !== game || computeSearchReleaseHash(manifest) !== manifest.releaseHash) {
      throw new Error('The current search manifest does not identify a valid release for this game.');
    }
    return manifest;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function updateRetirementRecords(
  client: S3Client,
  bucket: string,
  game: SearchPublicationGame,
  retiredNow: string[],
  activeNow: string[],
  now: Date,
): Promise<void> {
  const prefix = `search/${game}/retired/`;
  for (const key of activeNow) {
    const digest = digestFromKey(key);
    if (digest == null) continue;
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `${prefix}${digest}.json` }));
  }
  for (const key of retiredNow) {
    const digest = digestFromKey(key);
    if (digest == null) continue;
    const markerKey = `${prefix}${digest}.json`;
    await client.send(new PutObjectCommand({
      Bucket:       bucket,
      Key:          markerKey,
      Body:         JSON.stringify({ sha256: digest, unreferencedAt: now.toISOString() }),
      ContentType:  'application/json; charset=utf-8',
      CacheControl: 'no-store',
    }));
  }
}

async function collectExpiredObjects(
  client: S3Client,
  bucket: string,
  game: SearchPublicationGame,
  protectedKeys: Set<string>,
  now: Date,
): Promise<number> {
  const prefix = `search/${game}/retired/`;
  let continuationToken: string | undefined;
  let deleted = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }));
    for (const item of page.Contents ?? []) {
      if (item.Key == null || !item.Key.endsWith('.json')) continue;
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: item.Key }));
      const body = await response.Body?.transformToString();
      if (body == null) continue;
      const marker = retiredMarker.safeParse(JSON.parse(body));
      if (!marker.success) continue;
      const objectKey = `search/${game}/objects/${marker.data.sha256}.sqlite`;
      if (protectedKeys.has(objectKey) || now.getTime() - Date.parse(marker.data.unreferencedAt) < RETENTION_MS) continue;
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key }));
      deleted++;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return deleted;
}

function digestFromKey(key: string): string | null {
  const digest = /\/objects\/([a-f0-9]{64})\.sqlite$/.exec(key)?.[1];
  return digest ?? null;
}

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, '');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new Error('Search package publication was canceled.');
}

async function hashBody(body: { transformToWebStream(): ReadableStream }): Promise<string> {
  const hash = createHash('sha256');
  const stream = Readable.fromWeb(body.transformToWebStream() as import('node:stream/web').ReadableStream<Uint8Array>);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const retiredMarker = z.strictObject({
  sha256:         sha256Schema,
  unreferencedAt: z.iso.datetime(),
});

function isNotFound(error: unknown): boolean {
  return error instanceof S3ServiceException
    ? error.$metadata.httpStatusCode === 404 || error.name === 'NoSuchKey' || error.name === 'NotFound'
    : typeof error === 'object' && error !== null && '$metadata' in error
      && typeof error.$metadata === 'object' && error.$metadata !== null
      && 'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 404;
}
