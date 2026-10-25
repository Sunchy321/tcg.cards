import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Settings } from './settings.ts';
import { admitPublish } from './publish-admission.ts';

/** Console-backend stub exposing only the admission endpoint. */
function backend() {
  const state = { status: 200 };
  const server = createServer((request, response) => {
    if (request.url === '/publish/admission' && request.method === 'POST') {
      response.statusCode = state.status;
      response.setHeader('content-type', 'application/json');
      response.end(state.status === 200 ? '{"allowed":true,"game":"magic"}' : '{"allowed":false}');
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

/** Settings stub with one stored remote session pointing at the stub backend. */
function fixture(baseUrl: string) {
  let data: Record<string, unknown> = {};
  const service = new Settings(
    {
      read:  () => structuredClone(data),
      write: value => {
        data = structuredClone(value);
      },
    },
    {
      async encrypt(value: string) {
        return Buffer.from(`encrypted:${value}`).toString('base64');
      },
      async decrypt(value: string) {
        return Buffer.from(value, 'base64').toString().slice(10);
      },
    },
  );
  return {
    service,
    async signIn(): Promise<void> {
      await service.setSecret('remote-session', JSON.stringify({
        baseUrl:      `${baseUrl}/`,
        cookieHeader: 'better-auth.session_token=token',
        username:     'operator',
        expiresAt:    new Date(Date.now() + 3_600_000).toISOString(),
      }));
    },
  };
}

test('admission resolves when the backend authorizes the game', async () => {
  const server = backend();
  const url = await server.start();
  try {
    const { service, signIn } = fixture(url);
    await signIn();
    await admitPublish(service, 'magic');
  } finally {
    await server.close();
  }
});

test('a missing session refuses before any request is made', async () => {
  const { service } = fixture('http://127.0.0.1:1');
  await assert.rejects(admitPublish(service, 'magic'), /需要先登录/);
});

test('an expired login, a denied account and server errors each refuse publishing', async () => {
  const server = backend();
  const url = await server.start();
  const { service, signIn } = fixture(url);
  await signIn();
  try {
    server.state.status = 401;
    await assert.rejects(admitPublish(service, 'magic'), /登录已失效/);
    server.state.status = 403;
    await assert.rejects(admitPublish(service, 'magic'), /没有发布万智牌/);
    server.state.status = 500;
    await assert.rejects(admitPublish(service, 'magic'), /验证失败（HTTP 500）/);
  } finally {
    await server.close();
  }
});

test('an unreachable backend refuses publishing instead of skipping the check', async () => {
  const server = backend();
  const url = await server.start();
  const { service, signIn } = fixture(url);
  await signIn();
  await server.close();
  await assert.rejects(admitPublish(service, 'magic'), /无法连接服务/);
});
