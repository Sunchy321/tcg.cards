import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import {
  CREDENTIAL_REFRESH_MARGIN_MS,
  PublishCredentialCache,
  isCredentialReusable,
  requestPublishCredential,
} from './publish-credentials.ts';

/** Console-service stub exposing only the credential endpoint. */
function service() {
  const state = { status: 200, requests: 0, lastBody: '' };
  const server = createServer((request, response) => {
    if (request.url === '/publish/credential' && request.method === 'POST') {
      state.requests += 1;
      let body = '';
      request.on('data', chunk => {
        body += chunk;
      });
      request.on('end', () => {
        state.lastBody = body;
        response.statusCode = state.status;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(state.status === 200
          ? {
            allowed:           true,
            userId:            'user-123',
            connectionString:  'postgres://publish_abc:secret@db.example.com:5432/postgres',
            expiresAt:         Date.now() + 3_600_000,
            targetFingerprint: 'destination-identity',
          }
          : { allowed: false, message: '当前账号没有发布该游戏数据的权限。' }));
      });
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

test('the issued grant carries the account, credential and destination identity', async () => {
  const stub = service();
  const baseUrl = await stub.start();
  try {
    const grant = await requestPublishCredential({ baseUrl, cookieHeader: 'better-auth.session_token=token' }, 'magic');

    assert.equal(grant.userId, 'user-123');
    assert.match(grant.connectionString, /^postgres:\/\/publish_abc:/);
    assert.equal(grant.targetFingerprint, 'destination-identity');
    assert.ok(grant.expiresAt > Date.now());
    assert.equal(stub.state.requests, 1);
    assert.match(stub.state.lastBody, /"game":"magic"/);
  } finally {
    await stub.close();
  }
});

test('a forbidden admission surfaces the service message', async () => {
  const stub = service();
  const baseUrl = await stub.start();
  stub.state.status = 403;
  try {
    await assert.rejects(
      requestPublishCredential({ baseUrl, cookieHeader: 'cookie' }, 'hearthstone'),
      /没有发布炉石传说数据的权限/,
    );
  } finally {
    await stub.close();
  }
});

test('credential requests use the supplied desktop transport and preserve the session', async () => {
  const stub = service();
  const baseUrl = await stub.start();
  let requests = 0;
  try {
    const grant = await requestPublishCredential(
      { baseUrl, cookieHeader: 'better-auth.session_token=token' },
      'hearthstone',
      async (url, init) => {
        requests += 1;
        assert.equal(url.toString(), `${baseUrl}/publish/credential`);
        assert.equal(new Headers(init.headers).get('cookie'), 'better-auth.session_token=token');
        assert.equal(init.method, 'POST');
        assert.equal(init.body, JSON.stringify({ game: 'hearthstone' }));
        return fetch(url, init);
      },
    );

    assert.equal(requests, 1);
    assert.equal(grant.userId, 'user-123');
  } finally {
    await stub.close();
  }
});

test('a desktop transport failure cancels publication', async () => {
  await assert.rejects(
    requestPublishCredential(
      { baseUrl: 'https://console.example.com/', cookieHeader: 'cookie' },
      'hearthstone',
      async () => { throw new Error('net::ERR_CONNECTION_TIMED_OUT'); },
    ),
    /无法连接服务获取发布凭据，已取消发布/,
  );
});

test('an expired session is reported instead of publishing', async () => {
  const stub = service();
  const baseUrl = await stub.start();
  stub.state.status = 401;
  try {
    await assert.rejects(
      requestPublishCredential({ baseUrl, cookieHeader: 'cookie' }, 'magic'),
      /登录已失效/,
    );
  } finally {
    await stub.close();
  }
});

test('credentials are reused until shortly before they expire', () => {
  const now = 1_000_000;
  const credential = { connectionString: 'postgres://x', expiresAt: now + CREDENTIAL_REFRESH_MARGIN_MS + 1, targetFingerprint: 'a' };
  const cache = new PublishCredentialCache();
  cache.set('target-a', { ...credential, userId: 'user-1' });

  assert.equal(cache.get('target-a', now)?.userId, 'user-1');
  assert.equal(isCredentialReusable(credential, now), true);
  // Inside the refresh margin the credential is treated as gone so the next publish renews it.
  assert.equal(isCredentialReusable(credential, credential.expiresAt - CREDENTIAL_REFRESH_MARGIN_MS), false);
  assert.equal(cache.get('target-a', credential.expiresAt - CREDENTIAL_REFRESH_MARGIN_MS), null);
});

test('each target keeps its own credential', () => {
  const cache = new PublishCredentialCache();
  cache.set('target-a', { connectionString: 'postgres://a', expiresAt: Date.now() + 3_600_000, targetFingerprint: 'a', userId: 'user-1' });
  cache.set('target-b', { connectionString: 'postgres://b', expiresAt: Date.now() + 3_600_000, targetFingerprint: 'b', userId: 'user-2' });

  assert.equal(cache.get('target-a')?.connectionString, 'postgres://a');
  assert.equal(cache.get('target-b')?.connectionString, 'postgres://b');
  assert.equal(cache.get('target-c'), null);
});
