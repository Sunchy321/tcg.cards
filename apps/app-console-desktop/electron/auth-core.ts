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
  await settings.setSecret(SESSION_KEY, session ? JSON.stringify(session) : null);
  return statusOf(session);
}

/** Extracts name=value pairs from set-cookie headers, dropping every attribute. */
function cookieHeaderOf(response: Response): string {
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).filter(Boolean).join('; ');
}

/** Local session view without contacting the backend; unreadable state counts as logged out. */
export async function authStatus(settings: Settings): Promise<RemoteAuthStatus> {
  return statusOf(await stored(settings));
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

/** Exposes the transport envelope of the stored session for trusted backend calls. */
export async function authSessionEnvelope(settings: Settings): Promise<{ baseUrl: string, cookieHeader: string } | null> {
  const session = await stored(settings);
  return session ? { baseUrl: session.baseUrl, cookieHeader: session.cookieHeader } : null;
}

/** Reads only the existing cloud rule file catalog through the authenticated console API. */
export async function authListMagicRuleFiles(settings: Settings): Promise<RemoteMagicRuleFile[]> {
  const session = await authSessionEnvelope(settings);
  if (!session) throw new Error('此操作需要先登录。');

  let responseStatus: number | null = null;
  const api = createConsoleApiClient<WebRouter>({
    url:   new URL('rpc', session.baseUrl).toString(),
    fetch: async (request, init) => {
      const headers = new Headers(request instanceof Request ? request.headers : undefined);
      headers.set('cookie', session.cookieHeader);
      const response = await fetch(request, { ...init, headers });
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
export async function authLogin(settings: Settings, baseUrl: string, username: string, password: string): Promise<RemoteAuthStatus> {
  const base = serviceBase(baseUrl);
  const response = await call(new URL('auth/sign-in/username', base), {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) throw new Error('用户名或密码不正确。');
    throw new Error(`登录失败（HTTP ${response.status}）。`);
  }
  const cookieHeader = cookieHeaderOf(response);
  const body = await response.json().catch(() => null) as {
    session?: { expiresAt?: string };
    user?:    { username?: string, name?: string };
  } | null;
  const expiresAt = body?.session?.expiresAt;
  if (!cookieHeader || !expiresAt) throw new Error('登录成功但服务未返回会话，请检查服务配置。');
  return persist(settings, {
    baseUrl:  base,
    cookieHeader,
    username: body.user?.username || body.user?.name || username,
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
