import { Hono } from 'hono';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIGenerator } from '@orpc/openapi';
import { createDb, runWithDb } from '@tcg-cards/db';

import { authenticate, isConstantEndpoint, pathSegments } from './auth-middleware';
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

/** CORS: open to any origin, allows the Authorization header, no credentials. */
function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
  };
}

/** Constant endpoints are static and CDN-cacheable; make them publicly cacheable. */
function cacheHeaders(pathname: string): Record<string, string> {
  if (isConstantEndpoint(pathSegments(pathname))) {
    return { 'cache-control': 'public, max-age=3600' };
  }

  return {};
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

hono.options('/v1/*', c => {
  return new Response(null, { status: 204, headers: corsHeaders() });
});

async function handleApiRequest(request: Request, env: ApiServiceEnv) {
  installRuntimeBindings(env);

  const authError = await authenticate(request, env);

  if (authError) {
    return authError;
  }

  const { response } = await openapiHandler.handle(request, { prefix: '/v1' });

  if (response) {
    return response;
  }

  return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Not found' }), {
    status:  404,
    headers: { 'content-type': 'application/json' },
  });
}

hono.all('/v1/*', c => {
  return withRequestDb(c.env, async () => {
    const result = await handleApiRequest(c.req.raw, c.env);

    for (const [key, value] of Object.entries({
      ...corsHeaders(),
      ...cacheHeaders(c.req.path),
    })) {
      result.headers.set(key, value);
    }

    return result;
  });
});

// Unversioned paths hit the latest version directly (no redirect).
hono.all('/:game/*', c => {
  const url = new URL(c.req.url);
  url.pathname = `/v1${url.pathname}`;
  const request = new Request(url, c.req.raw);

  return withRequestDb(c.env, async () => {
    const result = await handleApiRequest(request, c.env);

    for (const [key, value] of Object.entries({
      ...corsHeaders(),
      ...cacheHeaders(c.req.path),
    })) {
      result.headers.set(key, value);
    }

    return result;
  });
});

export default hono;
