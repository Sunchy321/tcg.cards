import type { AdmissionGame } from './contract.ts';
import { PUBLISH_GAME_LABELS } from './publish-admission.ts';

/** One issued publish credential held in the main process until it expires. */
export interface IssuedPublishCredential {
  connectionString:  string;
  /** Epoch milliseconds when the credential stops working. */
  expiresAt:         number;
  /** Destination identity reported by the service that issued the credential. */
  targetFingerprint: string;
}

/** One admitted publish account together with the credential it may use. */
export interface PublishCredentialGrant extends IssuedPublishCredential {
  userId: string;
}

/** Credential reused while it still has more than this much life left. */
export const CREDENTIAL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Reports whether one credential may still be reused at a given time. */
export function isCredentialReusable(
  credential: IssuedPublishCredential,
  now: number,
  marginMs = CREDENTIAL_REFRESH_MARGIN_MS,
): boolean {
  return credential.expiresAt - marginMs > now;
}

/** Credentials held per publish target, reused across tasks until they expire. */
export class PublishCredentialCache {
  private entries = new Map<string, PublishCredentialGrant>();

  /** Returns the cached grant for one target when its credential is still fresh. */
  get(targetId: string, now = Date.now()): PublishCredentialGrant | null {
    const entry = this.entries.get(targetId);
    if (!entry) return null;
    if (!isCredentialReusable(entry, now)) {
      this.entries.delete(targetId);
      return null;
    }
    return entry;
  }

  /** Stores one freshly issued grant for a target. */
  set(targetId: string, grant: PublishCredentialGrant): void {
    this.entries.set(targetId, grant);
  }
}

/** Session envelope the desktop stores after signing in to the console service. */
export interface PublishSessionEnvelope {
  baseUrl:      string;
  cookieHeader: string;
}

/**
 * Requests admission and a short-lived credential from the console service.
 * The service answers with the account identity and the destination it authorized.
 */
export async function requestPublishCredential(
  session: PublishSessionEnvelope,
  game: AdmissionGame,
  request: (url: URL, init: RequestInit) => Promise<Response> = fetch,
): Promise<PublishCredentialGrant> {
  let response: Response;
  try {
    response = await request(new URL('publish/credential', session.baseUrl), {
      method:  'POST',
      headers: { 'content-type': 'application/json', 'cookie': session.cookieHeader },
      body:    JSON.stringify({ game }),
    });
  } catch {
    throw new Error('无法连接服务获取发布凭据，已取消发布。');
  }

  if (response.status === 401) throw new Error('登录已失效，请重新登录。');
  if (response.status === 403) throw new Error(`当前账号没有发布${PUBLISH_GAME_LABELS[game]}数据的权限。`);

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || body?.allowed !== true) {
    const message = typeof body?.message === 'string' && body.message.trim()
      ? body.message
      : `发布凭据签发失败（HTTP ${response.status}）。`;
    throw new Error(message);
  }

  const { userId, connectionString, expiresAt, targetFingerprint } = body;
  if (
    typeof userId !== 'string' || !userId.trim()
    || typeof connectionString !== 'string' || !connectionString.trim()
    || typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)
    || typeof targetFingerprint !== 'string' || !targetFingerprint.trim()
  ) {
    throw new Error('发布凭据签发失败。');
  }

  return { userId, connectionString, expiresAt, targetFingerprint };
}
