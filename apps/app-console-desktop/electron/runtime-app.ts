import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { locale } from '@tcg-cards/model/hearthstone/schema/basic';

import { hearthstoneRouter } from './runtime/orpc/hearthstone';
import { imageRouter } from './runtime/orpc/image';
import { magicRouter } from './runtime/orpc/magic';
import { runtimeRouter } from './runtime/orpc/runtime';
import './runtime/lib/game-path-definitions';
import { requireHearthstoneImageBucketDir } from './runtime/lib/hearthstone/image-config';
import { buildAiParseStreamResponse } from './runtime/lib/hearthstone/announcement/ai-parse-stream';
import { buildRenderAllStreamResponse } from './runtime/lib/hearthstone/announcement/render-all-stream';
import { hasAiConfig } from './runtime/runtime-config';

/** Removes task creation endpoints that must go through Electron's main process. */
function withoutTaskCreation(route: Record<string, unknown>) {
  const copy = { ...route };
  delete copy.createTask;
  return copy;
}

/** Removes publish endpoints that bypass Electron's admission and confirmation flow. */
function withoutLegacyPublishBypass(route: Record<string, unknown>) {
  const copy = withoutTaskCreation(route);
  delete copy.publishSingleCard;
  delete copy.registerPublishStream;
  return copy;
}

/** Removes archive access that accepts a renderer-supplied local file path. */
function withoutArbitraryArchiveReads(route: Record<string, unknown>) {
  const copy = { ...route };
  delete copy.getArchive;
  return copy;
}

const electronRouter = {
  runtime:     { health: runtimeRouter.health },
  hearthstone: withoutLegacyPublishBypass(hearthstoneRouter as Record<string, unknown>),
  hsdata:      withoutLegacyPublishBypass(hearthstoneRouter as Record<string, unknown>),
  image:       withoutArbitraryArchiveReads(imageRouter as Record<string, unknown>),
  magic:       magicRouter,
};

const rpcHandler = new RPCHandler(electronRouter as any, {
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
} as any);

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

const hono = new Hono();

hono.use('*', cors({
  origin:        requestOrigin => requestOrigin == null || requestOrigin === 'null' || requestOrigin.startsWith('http://localhost:') || requestOrigin.startsWith('http://127.0.0.1:') ? requestOrigin ?? '*' : '',
  allowMethods:  ['GET', 'POST', 'OPTIONS'],
  allowHeaders:  ['content-type', 'authorization', 'x-tcg-editor-runtime', 'x-tcg-sync-mode', 'x-tcg-editor-identity', 'x-tcg-task-host'],
  exposeHeaders: ['content-type'],
}));

/** Serves an image by its validated render hash instead of an arbitrary local path. */
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

  return new Response(new Uint8Array(image), {
    headers: {
      'content-type':  'image/webp',
      'cache-control': 'no-store',
    },
  });
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

hono.post('/render/stream', async c => {
  const parsed = renderAllStreamInput.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body.' }, 400);
  }

  return buildRenderAllStreamResponse(parsed.data);
});

hono.all('/rpc/*', async c => {
  const { response } = await rpcHandler.handle(c.req.raw, { prefix: '/rpc' });
  return response ?? c.notFound();
});

hono.get('/health', c => c.json({
  service: 'tcg-cards-console-desktop',
  runtime: 'node',
  status:  'ok',
  time:    new Date().toISOString(),
}));

export { hono as electronRuntimeApp };
