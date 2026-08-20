import { Hono } from 'hono';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIGenerator } from '@orpc/openapi';
import { createDb, runWithDb } from '@tcg-cards/db';

import { registry } from './registry';
import type { ApiServiceEnv } from './env';

const hono = new Hono<{
  Bindings: ApiServiceEnv;
}>();

function installRuntimeBindings(env: ApiServiceEnv) {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __env__?:    ApiServiceEnv;
    HYPERDRIVE?: ApiServiceEnv['HYPERDRIVE'];
  };

  runtimeGlobal.__env__ = env;
  runtimeGlobal.HYPERDRIVE = env.HYPERDRIVE;
}

const openapiHandler = new OpenAPIHandler(registry);

async function withRequestDb<T>(env: ApiServiceEnv, handler: () => Promise<T>): Promise<T> {
  const database = createDb(env.HYPERDRIVE.connectionString);
  return runWithDb(database, handler);
}

hono.get('/health', c => c.json({
  service: 'service-api',
  status:  'ok',
  time:    new Date().toISOString(),
}));

hono.get('/openapi.json', async c => {
  const generator = new OpenAPIGenerator();
  const spec = await generator.generate(registry, {
    info: { title: 'TCG Cards API', version: 'v1' },
  });

  return c.json(spec);
});

async function handleApiRequest(request: Request, env: ApiServiceEnv) {
  installRuntimeBindings(env);

  return withRequestDb(env, async () => {
    const { response } = await openapiHandler.handle(request, { prefix: '/v1' });

    if (response) {
      return response;
    }

    return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Not found' }), {
      status:  404,
      headers: { 'content-type': 'application/json' },
    });
  });
}

hono.all('/v1/*', c => handleApiRequest(c.req.raw, c.env));

// Unversioned paths hit the latest version directly (no redirect).
hono.all('/:game/*', c => {
  const url = new URL(c.req.url);
  url.pathname = `/v1${url.pathname}`;
  const request = new Request(url, c.req.raw);

  return handleApiRequest(request, c.env);
});

export default hono;
