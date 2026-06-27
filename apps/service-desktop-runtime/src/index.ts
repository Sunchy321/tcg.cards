import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

import { router } from './orpc/service';
import {
  resolveHearthstonePublishTarget,
  testDesktopDatabaseConnection,
} from './lib/runtime/desktop-database';
import { createTaskStore, createTaskScheduler, createTaskCleanup, registerTaskDefinition } from './lib/task';
import { publishTaskDefinition } from './lib/hearthstone/task';
import { testWorkTaskDefinition } from './lib/task/test-definition';
import { reanchorTaskDefinition } from './lib/hearthstone/task/reanchor';
import { imageRenderTaskDefinition } from './lib/hearthstone/task/image-render';

/** Resolves the local listen port from the current process environment. */
function readPort() {
  const raw = process.env.PORT;
  if (raw == null || raw.trim() === '') {
    return 4318;
  }

  const port = Number(raw);
  return Number.isInteger(port) && port > 0 ? port : 4318;
}

/** Builds the standard status payload shared by the desktop runtime endpoints. */
function buildStatus() {
  return {
    service: 'service-desktop-runtime',
    runtime: 'bun',
    status:  'ok',
    time:    new Date().toISOString(),
  };
}

const testLocalDatabaseInput = z.strictObject({
  connectionString: z.string().trim().min(1),
});

const testHearthstonePublishTargetInput = z.strictObject({
  publishTarget: z.string().trim().min(1),
  environment: z.string().trim().min(1),
  connectionString: z.string().trim().min(1),
});

/** Human-readable message normalized from one unknown thrown value. */
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const hono = new Hono();

registerTaskDefinition(publishTaskDefinition);
registerTaskDefinition(testWorkTaskDefinition);
registerTaskDefinition(reanchorTaskDefinition);
registerTaskDefinition(imageRenderTaskDefinition);

// Startup cleanup + background scheduler
import('./runtime-config').then(async ({ hasLocalDatabaseUrl }) => {
  if (!hasLocalDatabaseUrl()) return;
  const { getLocalDb } = await import('./lib/hearthstone/hsdata-local-db');
  const store = createTaskStore(getLocalDb());
  const scheduler = createTaskScheduler(store);

  // Abandon stale tasks left by a previous runtime boot before accepting new work
  await createTaskCleanup(store, scheduler).cleanupStartupState();

  setInterval(() => { void scheduler.trigger(); }, 30_000);
});

/** Decides whether one frontend origin may call the local desktop runtime over HTTP. */
function isAllowedOrigin(origin: string | undefined) {
  if (origin == null || origin === 'null') {
    return true;
  }

  if (origin === 'http://localhost:1420' || origin === 'http://127.0.0.1:1420') {
    return true;
  }

  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }

  return false;
}

const rpcHandler = new RPCHandler(router as any, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);
    }),
  ],
});

hono.use('*', cors({
  origin: requestOrigin => isAllowedOrigin(requestOrigin) ? requestOrigin ?? '*' : '',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['content-type', 'authorization', 'x-tcg-editor-runtime', 'x-tcg-sync-mode', 'x-tcg-editor-identity'],
  exposeHeaders: ['content-type'],
}));

hono.get('/', c => c.json({
  ...buildStatus(),
  role: 'desktop-local-runtime',
}));

hono.get('/health', c => c.json(buildStatus()));

hono.post('/desktop/test-local-database', async c => {
  const parsed = testLocalDatabaseInput.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json({
      message: 'Local database connection string is required.',
    }, 400);
  }

  try {
    return c.json(await testDesktopDatabaseConnection(parsed.data.connectionString));
  } catch (error) {
    return c.json({
      message: getErrorMessage(error),
    }, 500);
  }
});

hono.post('/desktop/test-hearthstone-publish-target', async c => {
  const parsed = testHearthstonePublishTargetInput.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json({
      message: 'Publish target, environment, and connection string are required.',
    }, 400);
  }

  try {
    return c.json(await resolveHearthstonePublishTarget(parsed.data));
  } catch (error) {
    return c.json({
      message: getErrorMessage(error),
    }, 500);
  }
});

hono.all('/rpc/*', async c => {
  const { response } = await rpcHandler.handle(c.req.raw, {
    prefix: '/rpc',
  });

  return response ?? c.notFound();
});

const port = readPort();

Bun.serve({
  port,
  fetch: hono.fetch,
});

console.log(`[service-desktop-runtime] local RPC endpoint http://localhost:${port}/rpc`);
