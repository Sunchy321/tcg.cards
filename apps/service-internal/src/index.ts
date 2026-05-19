import { Hono } from 'hono';
import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';
import { createDb, runWithDb } from '@tcg-cards/db';
import type { ConsoleApiRequestMeta } from '@tcg-cards/console-api/request-meta';

import { getAuth } from './auth';
import { router } from './orpc/service';

import type { InternalServiceEnv } from './env';

const hono = new Hono<{
  Bindings: InternalServiceEnv;
}>();

function installRuntimeBindings(env: InternalServiceEnv) {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __env__?:    InternalServiceEnv;
    HYPERDRIVE?: InternalServiceEnv['HYPERDRIVE'];
  };

  runtimeGlobal.__env__ = env;
  runtimeGlobal.HYPERDRIVE = env.HYPERDRIVE;
}

/** Decodes caller-provided commit metadata from transport headers. */
function readRequestMeta(request: Request): ConsoleApiRequestMeta {
  return {
    editorRuntime:  request.headers.get('x-tcg-editor-runtime') as ConsoleApiRequestMeta['editorRuntime'] ?? undefined,
    syncMode:       request.headers.get('x-tcg-sync-mode') as ConsoleApiRequestMeta['syncMode'] ?? undefined,
    editorIdentity: request.headers.get('x-tcg-editor-identity'),
  };
}

const rpcHandler = new RPCHandler(router as any, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);
    }),
  ],
});

/** Error responses encoded as the lightweight JSON shape expected by desktop callers. */
function jsonErrorResponse(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

hono.get('/', c => c.json({
  service: 'service-internal',
  status:  'ok',
  auth:    'better-auth',
}));

hono.get('/health', c => c.json({
  service: 'service-internal',
  status:  'ok',
  time:    new Date().toISOString(),
}));

async function handleAuthRequest(request: Request, env: InternalServiceEnv) {
  // Recreate the request inside the current handler context to avoid
  // Cloudflare Worker I/O ownership issues when downstream code reads the body.
  const authRequest = new Request(request);
  return await getAuth(env, { baseURL: new URL(authRequest.url).origin }).handler(authRequest);
}

type ClosableDb = ReturnType<typeof createDb> & {
  $client: {
    end(options?: { timeout?: number | null }): Promise<unknown>;
  };
};

async function withRequestDb<T>(env: InternalServiceEnv, handler: () => Promise<T>): Promise<T> {
  const database = createDb(env.HYPERDRIVE.connectionString) as ClosableDb;

  try {
    return await runWithDb(database, handler);
  } finally {
    await database.$client.end({ timeout: 0 });
  }
}

hono.all('/auth/*', async c => {
  installRuntimeBindings(c.env);
  return await withRequestDb(c.env, async () => await handleAuthRequest(c.req.raw, c.env));
});

hono.all('/rpc/*', async c => {
  installRuntimeBindings(c.env);
  const { response } = await withRequestDb(c.env, async () => await rpcHandler.handle(c.req.raw, {
    prefix:  '/rpc',
    context: {
      env:  c.env,
      meta: readRequestMeta(c.req.raw),
    },
  }));
  return response ?? c.notFound();
});

export default hono;
