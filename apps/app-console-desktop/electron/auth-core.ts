import type { RemoteAuthProfile, RemoteAuthStatus, RemoteMagicRuleFile } from './contract.ts';
import type { Settings } from './settings.ts';
import { createConsoleApiClient } from '@tcg-cards/console-platform';
import type { WebRouter } from '@tcg-cards/console-api';

/** Encrypted shape persisted as the remote-session secret. */
interface StoredSession {
  baseUrl:      string;
  cookieHeader: string;
  username:     string;
  expiresAt:    string;
}

const SESSION_KEY = 'remote-session';
const sessionRevisions = new WeakMap<Settings, number>();
const pendingRefreshes = new WeakMap<Settings, Promise<StoredSession | null>>();

/** Accepts only plain console service addresses, never credential-bearing URLs. */
function serviceBase(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('请输入有效的控制台服务地址。');
  }
  if (
    !/^https?:$/.test(url.protocol)
    || !url.hostname
    || url.username
    || url.password
    || url.search
    || url.hash
  ) throw new Error('请输入有效的控制台服务地址。');
  // Keep a deployment subpath so relative auth endpoints resolve under it.
  const base = url.origin + url.pathname;
  return base.endsWith('/') ? base : `${base}/`;
}

/** One fetch against the console backend; transport failures carry no response detail. */
async function call(url: URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error('无法连接服务，请检查地址和网络。');
  }
}

/** Reads the persisted session; unreadable or partial state counts as logged out. */
async function stored(settings: Settings): Promise<StoredSession | null> {
  const raw = await settings.secret(SESSION_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredSession;
    if (
      typeof value.baseUrl !== 'string'
      || typeof value.cookieHeader !== 'string'
      || typeof value.username !== 'string'
      || typeof value.expiresAt !== 'string'
    ) return null;
    return value;
  } catch {
    return null;
  }
}

/** Projects the stored session into the public view; expiry is judged locally. */
function statusOf(session: StoredSession | null): RemoteAuthStatus {
  if (!session) return { baseUrl: null, username: null, expiresAt: null, loggedIn: false };
  return {
    baseUrl:   session.baseUrl,
    username:  session.username,
    expiresAt: session.expiresAt,
    loggedIn:  !!session.cookieHeader && new Date(session.expiresAt).getTime() > Date.now(),
  };
}

/** Encrypts the whole session into the secret store and returns its public view. */
async function persist(settings: Settings, session: StoredSession | null): Promise<RemoteAuthStatus> {
  sessionRevisions.set(settings, (sessionRevisions.get(settings) ?? 0) + 1);
  await settings.setSecret(SESSION_KEY, session ? JSON.stringify(session) : null);
  return statusOf(session);
}

/** Extracts name=value pairs from set-cookie headers, dropping every attribute. */
function cookieHeaderOf(response: Response): string {
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).filter(Boolean).join('; ');
}

/** Synchronizes session expiry and cookies while preserving the local session on transient failures. */
async function refreshStoredSession(settings: Settings): Promise<StoredSession | null> {
  const revision = sessionRevisions.get(settings);
  const session = await stored(settings);
  if (!session) return null;

  const response = await call(new URL('auth/get-session', session.baseUrl), {
    method:   'GET',
    headers:  { cookie: session.cookieHeader },
    redirect: 'error',
    signal:   AbortSignal.timeout(5_000),
  }).catch(() => null);

  if (response?.status === 401) {
    return saveRefreshedSession(settings, revision, null);
  }
  if (response?.ok) {
    const body = await response.json().catch(() => undefined) as { session?: { expiresAt?: unknown } | null } | null | undefined;
    if (body === null || body?.session === null) {
      return saveRefreshedSession(settings, revision, null);
    }
    const expiresAt = body?.session?.expiresAt;
    if (typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt))) {
      const cookieHeader = cookieHeaderOf(response) || session.cookieHeader;
      if (expiresAt !== session.expiresAt || cookieHeader !== session.cookieHeader) {
        return saveRefreshedSession(settings, revision, { ...session, expiresAt, cookieHeader });
      }
    }
  }
  return sessionRevisions.get(settings) === revision ? session : stored(settings);
}

/** Applies a refresh only while the session it queried is still current. */
async function saveRefreshedSession(settings: Settings, revision: number | undefined, session: StoredSession | null) {
  if (sessionRevisions.get(settings) !== revision) return stored(settings);
  await persist(settings, session);
  return stored(settings);
}

/** Shares an in-flight session query across startup, settings and remote operations. */
function refreshSession(settings: Settings): Promise<StoredSession | null> {
  const pending = pendingRefreshes.get(settings);
  if (pending) return pending;
  const refresh = refreshStoredSession(settings).finally(() => pendingRefreshes.delete(settings));
  pendingRefreshes.set(settings, refresh);
  return refresh;
}

/** Checks the remote session and reports its current local status. */
export async function authStatus(settings: Settings): Promise<RemoteAuthStatus> {
  return statusOf(await refreshSession(settings));
}

/** Reads only the account fields needed by the desktop account page. */
export async function authProfile(settings: Settings): Promise<RemoteAuthProfile | null> {
  const session = await stored(settings);
  if (!session || !statusOf(session).loggedIn) return null;

  const response = await call(new URL('auth/get-session', session.baseUrl), {
    method:  'GET',
    headers: { cookie: session.cookieHeader },
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`读取账号信息失败（HTTP ${response.status}）。`);

  const value = await response.json().catch(() => null) as {
    session?: { expiresAt?: unknown } | null;
    user?:    { name?: unknown, email?: unknown, username?: unknown, role?: unknown } | null;
  } | null;
  const expiresAt = value?.session?.expiresAt;
  const user = value?.user;
  if (
    typeof expiresAt !== 'string'
    || !Number.isFinite(new Date(expiresAt).getTime())
    || new Date(expiresAt).getTime() <= Date.now()
    || typeof user?.name !== 'string'
    || typeof user.email !== 'string'
  ) return null;

  return {
    name:     user.name,
    email:    user.email,
    username: typeof user.username === 'string' ? user.username : null,
    role:     typeof user.role === 'string' ? user.role : null,
    expiresAt,
  };
}

/** Exposes the active session for trusted backend calls and refreshes it by default. */
export async function authSessionEnvelope(settings: Settings, options = { refresh: true }): Promise<{ baseUrl: string, cookieHeader: string } | null> {
  const session = await (options.refresh ? refreshSession(settings) : stored(settings));
  return session && statusOf(session).loggedIn ? { baseUrl: session.baseUrl, cookieHeader: session.cookieHeader } : null;
}

/** Reads only the existing cloud rule file catalog through the authenticated console API. */
export async function authListMagicRuleFiles(
  settings: Settings,
  send: (request: Request, init?: RequestInit) => Promise<Response> = fetch,
): Promise<RemoteMagicRuleFile[]> {
  const session = await authSessionEnvelope(settings);
  if (!session) throw new Error('此操作需要先登录。');

  let responseStatus: number | null = null;
  const api = createConsoleApiClient<WebRouter>({
    url:   new URL('rpc', session.baseUrl).toString(),
    fetch: async (request, init) => {
      const headers = new Headers(request instanceof Request ? request.headers : undefined);
      headers.set('cookie', session.cookieHeader);
      // Use only the encrypted session cookie, never the transport's ambient cookies.
      const response = await send(request, { ...init, headers, credentials: 'omit' });
      responseStatus = response.status;
      return response;
    },
  });

  try {
    return await api.magic.rule.listFiles() as RemoteMagicRuleFile[];
  } catch (error) {
    if (responseStatus === 401) throw new Error('登录已失效，请重新登录。', { cause: error });
    if (responseStatus === 403) throw new Error('当前账号无权读取云端规则列表。', { cause: error });
    if (responseStatus == null) throw new Error('无法连接服务读取云端规则列表，请检查地址和网络。', { cause: error });
    throw error;
  }
}

/** Signs in to the deployed console backend and keeps the session cookie encrypted. */
export async function authLogin(settings: Settings, baseUrl: string, email: string, password: string): Promise<RemoteAuthStatus> {
  const base = serviceBase(baseUrl);
  const endpoint = new URL('auth/sign-in/email', base);
  const response = await call(endpoint, {
    method:  'POST',
    // Node fetch sends Fetch Metadata, so Better Auth requires a trusted Origin.
    headers: {
      'content-type': 'application/json',
      'origin':       endpoint.origin,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) throw new Error('邮箱或密码不正确。');
    if (response.status === 403) {
      const error = await response.json().catch(() => null) as { code?: unknown } | null;
      switch (error?.code) {
      case 'BANNED_USER':
        throw new Error('此账号已被停用。');
      case 'EMAIL_NOT_VERIFIED':
        throw new Error('请先验证邮箱，再登录。');
      case 'INVALID_ORIGIN':
      case 'MISSING_OR_NULL_ORIGIN':
      case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
        throw new Error('控制台服务拒绝了此登录请求。');
      }
    }
    throw new Error(`登录失败（HTTP ${response.status}）。`);
  }
  const cookieHeader = cookieHeaderOf(response);
  if (!cookieHeader) throw new Error('登录成功但服务未返回会话，请检查服务配置。');
  const body = await response.json().catch(() => null) as {
    session?: { expiresAt?: string };
    user?:    { username?: string, name?: string };
  } | null;
  let expiresAt = body?.session?.expiresAt;
  // Better Auth's email sign-in sets the cookie but omits the session expiration.
  if (!expiresAt) {
    const sessionResponse = await call(new URL('auth/get-session', base), {
      method:  'GET',
      headers: { cookie: cookieHeader },
    });
    if (sessionResponse.ok) {
      const session = await sessionResponse.json().catch(() => null) as { session?: { expiresAt?: string } } | null;
      expiresAt = session?.session?.expiresAt;
    }
  }
  if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error('登录成功但服务未返回会话，请检查服务配置。');
  }
  return persist(settings, {
    baseUrl:  base,
    cookieHeader,
    username: body?.user?.username || body?.user?.name || email,
    expiresAt,
  });
}

/** Signs out on the backend as best effort, then always drops the stored session. */
export async function authLogout(settings: Settings): Promise<RemoteAuthStatus> {
  const session = await stored(settings);
  if (session) {
    await call(new URL('auth/sign-out', session.baseUrl), {
      method:  'POST',
      headers: { cookie: session.cookieHeader },
    }).catch(() => {});
  }
  return persist(settings, null);
}
