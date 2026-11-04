import { Hono } from 'hono';
import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';
import { z } from 'zod';
import { createDb, runWithDb } from '@tcg-cards/db';
import type { ConsoleApiRequestMeta } from '@tcg-cards/console-api/request-meta';

import { getAuth } from './auth';
import { router, searchD1Router } from './orpc/service';
import { grantPublishCredential, isPublishableGame } from './publish-credentials';
import { searchPublishRequest, signSearchUploads, verifySearchObjects } from './search-publish';

import type { ConsoleApiEnv } from './env';

const hono = new Hono<{
  Bindings: ConsoleApiEnv;
}>();

function installRuntimeBindings(env: ConsoleApiEnv) {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __env__?:    ConsoleApiEnv;
    HYPERDRIVE?: ConsoleApiEnv['HYPERDRIVE'];
  };

  runtimeGlobal.__env__ = env;
  runtimeGlobal.HYPERDRIVE = env.HYPERDRIVE;
}

/** Decodes caller-provided commit metadata from transport headers. */
function readRequestMeta(request: Request): ConsoleApiRequestMeta {
  return {
    editorRuntime:  request.headers.get('x-tcg-editor-runtime') as ConsoleApiRequestMeta['editorRuntime'] ?? undefined,
    syncMode:       request.headers.get('x-tcg-sync-mode') as ConsoleApiRequestMeta['syncMode'] ?? undefined,
    editorIdentity: request.headers.get('x-tcg-editor-identity') ?? undefined,
  };
}

const rpcHandler = new RPCHandler(router as any, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);
    }),
  ],
});

const searchD1Handler = new RPCHandler(searchD1Router as any, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);
    }),
  ],
});

hono.get('/', c => c.json({
  service: 'service-console-api',
  status:  'ok',
  auth:    'better-auth',
}));

hono.get('/health', c => c.json({
  service: 'service-console-api',
  status:  'ok',
  time:    new Date().toISOString(),
}));

async function handleAuthRequest(request: Request, env: ConsoleApiEnv) {
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

async function withRequestDb<T>(env: ConsoleApiEnv, handler: () => Promise<T>): Promise<T> {
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

const publishCredentialRequest = z.strictObject({ game: z.string().trim().min(1) });

/**
 * Admits one publish account and issues its short-lived database credential.
 * The desktop keeps writing to PostgreSQL directly; this endpoint only decides
 * who may publish and hands out a time-limited login for that destination.
 */
hono.post('/publish/credential', async c => {
  installRuntimeBindings(c.env);

  const parsed = publishCredentialRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ allowed: false, message: '发布请求无效。' }, 400);
  const game = parsed.data.game;
  if (!isPublishableGame(game)) return c.json({ allowed: false, message: '发布请求无效。' }, 400);

  return await withRequestDb(c.env, async () => {
    const result = await grantPublishCredential(
      c.env,
      c.req.raw.headers,
      game,
      new URL(c.req.raw.url).origin,
    );
    return c.json(result.body, result.status as 200);
  });
});

/**
 * Admits one search publication and returns the direct upload URLs the desktop
 * still needs. Large package bytes never pass through the Worker.
 */
hono.post('/search-publish/objects', async c => {
  installRuntimeBindings(c.env);

  const parsed = searchPublishRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ allowed: false, message: '搜索数据发布请求无效。' }, 400);

  return await withRequestDb(c.env, async () => {
    const result = await signSearchUploads(
      c.env,
      c.req.raw.headers,
      new URL(c.req.raw.url).origin,
      parsed.data,
    );
    return c.json(result.body, result.status as 200);
  });
});

/**
 * Reports whether every object a publication needs is present at its expected
 * size. The desktop writes the release pointer only after this confirms it.
 */
hono.post('/search-publish/verify', async c => {
  installRuntimeBindings(c.env);

  const parsed = searchPublishRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ allowed: false, message: '搜索数据发布请求无效。' }, 400);

  return await withRequestDb(c.env, async () => {
    const result = await verifySearchObjects(
      c.env,
      c.req.raw.headers,
      new URL(c.req.raw.url).origin,
      parsed.data,
    );
    return c.json(result.body, result.status as 200);
  });
});

/**
 * Serves the search D1 publisher procedures. Every call requires a live console
 * session because the procedures execute arbitrary statements on the bound
 * search databases, unlike the general console RPC surface.
 */
hono.all('/search-d1/rpc/*', async c => {
  installRuntimeBindings(c.env);
  return await withRequestDb(c.env, async () => {
    const auth = getAuth(c.env, { baseURL: new URL(c.req.raw.url).origin });
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.session == null) {
      return c.json({ message: '请先登录控制台服务。' }, { status: 401 });
    }
    const { response } = await searchD1Handler.handle(c.req.raw, {
      prefix:  '/search-d1/rpc',
      context: {
        env: {
          MAGIC_SEARCH_DB:       c.env.MAGIC_SEARCH_DB,
          HEARTHSTONE_SEARCH_DB: c.env.HEARTHSTONE_SEARCH_DB,
        },
      },
    });
    return response ?? c.notFound();
  });
});

export default hono;
