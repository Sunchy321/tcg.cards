import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { locale } from '@tcg-cards/model/hearthstone/schema/basic';

import { router } from './orpc/service';
import {
  resolveHearthstonePublishTarget,
  resolveYugiohPublishTarget,
  testDesktopDatabaseConnection,
} from './lib/runtime/desktop-database';
import { requireHearthstoneImageBucketDir } from './lib/hearthstone/image-config';
import { buildAiParseStreamResponse } from './lib/hearthstone/announcement/ai-parse-stream';
import { buildMagicAiParseStreamResponse } from './lib/magic/announcement/ai-parse-stream';
import { buildRenderAllStreamResponse } from './lib/hearthstone/announcement/render-all-stream';
import { hasAiConfig } from './runtime-config';
import { buildBanlistReportResponse } from './lib/magic/banlist-check/report-http';

/** Builds the status payload shared by the desktop runtime endpoints. */
function buildStatus() {
  return {
    service: 'service-desktop-runtime',
    runtime: 'bun' in process.versions ? 'bun' : 'node',
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
  publishTargetId:  z.string().trim().min(1),
  environment:      z.literal('test'),
  connectionString: z.string().trim().min(1),
});

const aiParseStreamInput = z.object({
  name:  z.string().optional(),
  links: z.array(z.object({ url: z.string().trim().min(1), label: z.string().optional() })).min(1),
});

const renderAllStreamInput = z.object({
  items: z.array(z.object({
    itemKey:     z.string(),
    type:        z.string(),
    cardId:      z.string().nullable(),
    format:      z.string().nullable(),
    version:     z.number().int().nullable().optional(),
    lastVersion: z.number().int().nullable().optional(),
    delta:       z.any().nullable().optional(),
    glow:        z.any().nullable().optional(),
  })),
  version:     z.number().int(),
  lastVersion: z.number().int().nullable().optional(),
  langs:       z.array(locale).default([]),
  mode:        z.enum(['missing', 'all']),
});

/** Human-readable message normalized from one unknown thrown value. */
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const hono = new Hono();

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

const rpcOptions = {
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
};

const rpcHandler = new RPCHandler(router as any, rpcOptions as any);

hono.use('*', cors({
  origin:        requestOrigin => isAllowedOrigin(requestOrigin) ? requestOrigin ?? '*' : '',
  allowMethods:  ['GET', 'POST', 'OPTIONS'],
  allowHeaders:  ['content-type', 'authorization', 'x-tcg-editor-runtime', 'x-tcg-sync-mode', 'x-tcg-editor-identity', 'x-tcg-task-host'],
  exposeHeaders: ['content-type'],
}));

hono.get('/', c => c.json({
  ...buildStatus(),
  role: 'desktop-local-runtime',
}));

hono.get('/health', c => c.json(buildStatus()));

// Fresh read-only evidence export; the runtime owns database and source access.
hono.get('/magic/banlist-report', c => buildBanlistReportResponse(c.req.query('download') === '1'));

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
  let image: Buffer;
  try {
    image = await readFile(filePath);
  } catch {
    return c.notFound();
  }

  // Local files, so no aggressive caching: the browser always fetches the
  // current bytes, keeping overwritten images in sync without cache busting.
  return new Response(new Uint8Array(image), {
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

hono.post('/ai/parse/stream', async c => {
  if (!hasAiConfig()) {
    return c.json({ error: 'AI config not set. Please configure API key in settings.' }, 400);
  }

  const parsed = aiParseStreamInput.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body: links are required.' }, 400);
  }

  return buildAiParseStreamResponse(parsed.data, c.req.raw.signal);
});

hono.post('/ai/magic/parse/stream', async c => {
  if (!hasAiConfig()) {
    return c.json({ error: '请先在设置中配置 AI。' }, 400);
  }
  const parsed = aiParseStreamInput.safeParse(await c.req.json());
  if (!parsed.success || parsed.data.links.some(link => !/^https?:\/\//i.test(link.url))) {
    return c.json({ error: '请输入有效的公告链接。' }, 400);
  }
  return buildMagicAiParseStreamResponse(parsed.data, c.req.raw.signal);
});

hono.post('/render/stream', async c => {
  const parsed = renderAllStreamInput.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body.' }, 400);
  }

  return buildRenderAllStreamResponse(parsed.data);
});

hono.all('/rpc/*', async c => {
  const { response } = await rpcHandler.handle(c.req.raw, {
    prefix: '/rpc',
  });

  return response ?? c.notFound();
});

export { hono as runtimeApp };
