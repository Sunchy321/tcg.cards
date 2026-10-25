import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Settings } from './settings.ts';
import { authLogin, authLogout, authStatus } from './auth-core.ts';

/** Console-backend stub speaking the small better-auth surface the app depends on. */
function backend() {
  const state = {
    session:      null as string | null,
    expiresAt:    new Date(Date.now() + 3_600_000).toISOString(),
    setCookie:    true,
    signOutFails: false,
  };
  const server = createServer((request, response) => {
    if (request.url === '/auth/sign-in/username' && request.method === 'POST') {
      let body = '';
      request.on('data', chunk => body += chunk);
      request.on('end', () => {
        const credentials = JSON.parse(body) as { username: string, password: string };
        if (credentials.username !== 'operator' || credentials.password !== 'correct-password') {
          response.statusCode = 401;
          response.end(JSON.stringify({ error: { message: 'Invalid credentials' } }));
          return;
        }
        state.session = 'session-token-1';
        if (state.setCookie) response.setHeader('set-cookie', ['better-auth.session_token=session-token-1; Path=/; HttpOnly']);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ session: { expiresAt: state.expiresAt }, user: { username: 'operator' } }));
      });
      return;
    }
    if (request.url === '/auth/sign-out' && request.method === 'POST') {
      if (state.signOutFails) {
        response.statusCode = 500;
        response.end();
        return;
      }
      state.session = null;
      response.end('{}');
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  return {
    state,
    async start(): Promise<string> {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    },
    async close(): Promise<void> {
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

/** Isolates persistence and encryption at the configuration service boundary. */
function fixture() {
  let data: Record<string, unknown> = {};
  const storage = {
    read:  () => structuredClone(data),
    write: (value: Record<string, unknown>) => {
      data = structuredClone(value);
    },
  };
  const cipher = {
    async encrypt(value: string) {
      return Buffer.from(`encrypted:${value}`).toString('base64');
    },
    async decrypt(value: string) {
      return Buffer.from(value, 'base64').toString().slice(10);
    },
  };
  return { service: new Settings(storage, cipher), storage, cipher };
}

test('login keeps an encrypted session that survives service reconstruction', async () => {
  const server = backend();
  const url = await server.start();
  try {
    const { service, storage, cipher } = fixture();
    const status = await authLogin(service, url, 'operator', 'correct-password');
    assert.equal(status.loggedIn, true);
    assert.equal(status.username, 'operator');
    assert.equal(status.baseUrl, `${url}/`);
    // The persisted document never holds the plaintext cookie.
    assert.equal(JSON.stringify(storage.read()).includes('session-token-1'), false);
    const reopened = new Settings(storage, cipher);
    assert.equal((await authStatus(reopened)).loggedIn, true);
  } finally {
    await server.close();
  }
});

test('rejected sign-ins explain themselves without echoing the password', async () => {
  const server = backend();
  const url = await server.start();
  try {
    const { service } = fixture();
    await assert.rejects(
      authLogin(service, url, 'operator', 'wrong-password'),
      error => error instanceof Error && error.message.includes('用户名或密码不正确') && !error.message.includes('wrong-password'),
    );
    assert.equal((await authStatus(service)).loggedIn, false);
  } finally {
    await server.close();
  }
});

test('service addresses must be plain http(s) origins', async () => {
  const { service } = fixture();
  for (const value of ['ftp://example.com', 'https://user:pass@example.com', 'not-a-url', 'https://example.com/?x=1']) {
    await assert.rejects(authLogin(service, value, 'operator', 'correct-password'), /服务地址/);
  }
});

test('a successful response without a session cookie is refused', async () => {
  const server = backend();
  server.state.setCookie = false;
  const url = await server.start();
  try {
    const { service } = fixture();
    await assert.rejects(authLogin(service, url, 'operator', 'correct-password'), /未返回会话/);
  } finally {
    await server.close();
  }
});

test('an expired stored session reports logged out without contacting the backend', async () => {
  const { service } = fixture();
  await service.setSecret('remote-session', JSON.stringify({
    baseUrl:      'https://console.example.com/',
    cookieHeader: 'better-auth.session_token=stale',
    username:     'operator',
    expiresAt:    new Date(Date.now() - 1_000).toISOString(),
  }));
  const status = await authStatus(service);
  assert.equal(status.loggedIn, false);
  assert.equal(status.username, 'operator');
});

test('an unreadable stored session counts as logged out', async () => {
  const { service } = fixture();
  await service.setSecret('remote-session', 'not-json');
  assert.equal((await authStatus(service)).loggedIn, false);
});

test('logout drops the stored session even when the backend refuses sign-out', async () => {
  const server = backend();
  server.state.signOutFails = true;
  const url = await server.start();
  try {
    const { service, storage, cipher } = fixture();
    await authLogin(service, url, 'operator', 'correct-password');
    assert.equal((await authLogout(service)).loggedIn, false);
    const reopened = new Settings(storage, cipher);
    assert.equal((await authStatus(reopened)).loggedIn, false);
    assert.equal((await reopened.secret('remote-session')), null);
  } finally {
    await server.close();
  }
});
