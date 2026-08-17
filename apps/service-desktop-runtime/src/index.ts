import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { join } from 'node:path';
import { z } from 'zod';

import { router } from './orpc/service';
import {
  resolveHearthstonePublishTarget,
  resolveYugiohPublishTarget,
  testDesktopDatabaseConnection,
} from './lib/runtime/desktop-database';
import { requireHearthstoneImageBucketDir } from './lib/hearthstone/image-config';
import { createTaskStore, createTaskScheduler, createTaskCleanup } from './lib/task';
import './lib/task/task-definitions';

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
  publishTarget:    z.string().trim().min(1),
  environment:      z.string().trim().min(1),
  connectionString: z.string().trim().min(1),
});

const testYugiohPublishTargetInput = z.strictObject({
  publishTargetId: z.string().trim().min(1),
  environment: z.literal('test'),
  connectionString: z.string().trim().min(1),
});

/** Human-readable message normalized from one unknown thrown value. */
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const hono = new Hono();

// Startup cleanup + background scheduler
import('./runtime-config').then(async ({ hasLocalDatabaseUrl }) => {
  if (!hasLocalDatabaseUrl()) return;
  const { getLocalDb } = await import('./lib/hearthstone/hsdata-local-db');
  const store = createTaskStore(getLocalDb());
  const scheduler = createTaskScheduler(store);

  // Abandon stale tasks left by a previous runtime boot before accepting new work
  await createTaskCleanup(store, scheduler).cleanupStartupState();

  setInterval(() => void scheduler.trigger(), 30_000);
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
      const cause = (error as any)?.cause;
      if (cause?.issues) {
        for (const issue of cause.issues) {
          console.error('[orpc] validation issue:', JSON.stringify(issue));
        }
      }
    }),
  ],
});

hono.use('*', cors({
  origin:        requestOrigin => isAllowedOrigin(requestOrigin) ? requestOrigin ?? '*' : '',
  allowMethods:  ['GET', 'POST', 'OPTIONS'],
  allowHeaders:  ['content-type', 'authorization', 'x-tcg-editor-runtime', 'x-tcg-sync-mode', 'x-tcg-editor-identity'],
  exposeHeaders: ['content-type'],
}));

hono.get('/', c => c.json({
  ...buildStatus(),
  role: 'desktop-local-runtime',
}));

hono.get('/health', c => c.json(buildStatus()));

// Serves stored card images by render hash so the frontend can load them in
// <img> tags (browser-cached, lazy) instead of fetching base64 blobs over RPC.
hono.get('/images/:category/:zone/:template/:premium/:prefix/:file', async c => {
  const { category, zone, template, premium, prefix, file } = c.req.param();
  const safeSegment = (value: string) => /^[a-z0-9_-]+$/.test(value);
  if (!safeSegment(category) || !safeSegment(zone) || !safeSegment(template) || !safeSegment(premium)
    || !/^[0-9a-f]{2}$/.test(prefix) || !/^[0-9a-f]+\.webp$/.test(file)) {
    return c.notFound();
  }

  let bucketDir: string;
  try {
    bucketDir = requireHearthstoneImageBucketDir();
  } catch {
    return c.notFound();
  }

  const filePath = join(bucketDir, 'hearthstone', 'card', category, zone, template, premium, prefix, file);
  const image = Bun.file(filePath);
  if (!(await image.exists())) return c.notFound();

  // Local files, so no aggressive caching: the browser always fetches the
  // current bytes, keeping overwritten images in sync without cache busting.
  return new Response(image, {
    headers: {
      'content-type':  'image/webp',
      'cache-control': 'no-store',
    },
  });
});

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

hono.post('/desktop/test-yugioh-publish-target', async c => {
  const parsed = testYugiohPublishTargetInput.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json({
      message: 'Yu-Gi-Oh! publish target id, test environment, and connection string are required.',
    }, 400);
  }

  try {
    return c.json(await resolveYugiohPublishTarget(parsed.data));
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
  // Bun's 10s default idleTimeout closes in-flight requests before the handler
  // writes a response byte, which cuts off long AI calls. Raise it to the max.
  idleTimeout: 255,
  fetch:       hono.fetch,
});

console.log(`[service-desktop-runtime] local RPC endpoint http://localhost:${port}/rpc`);
