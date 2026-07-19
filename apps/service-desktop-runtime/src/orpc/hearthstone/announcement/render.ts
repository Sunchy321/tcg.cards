import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';

import { checkItemImages, prepareItemRequests, renderAllItems, renderPreparedRequest } from '../../../lib/hearthstone/announcement/render';
import { requireHearthstoneImageBucketDir } from '../../../lib/hearthstone/image-config';
import { locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

const RENDERABLE_TYPES = ['card_change', 'card_update'] as const;

const itemInput = z.object({
  itemKey:     z.string().min(1),
  type:        z.string(),
  cardId:      z.string().nullable(),
  format:      z.string().nullable(),
  version:     z.number().int().nullable().optional(),
  lastVersion: z.number().int().nullable().optional(),
  delta:       z.object({
    prev: z.any().optional(),
    curr: z.any().optional(),
  }).nullable().optional(),
  glow: z.any().nullable().optional(),
});

const previewImageSchema = z.object({
  renderHash: z.string(),
  category:   z.string(),
  template:   z.string(),
});

const itemOperationInput = z.object({
  item:        itemInput,
  version:     z.number().int(),
  lastVersion: z.number().int().nullable().optional(),
  langs:       locale.array().default([]),
});

/** Resolves an empty language list to every supported Hearthstone locale. */
function resolveLangs(langs: z.infer<typeof locale>[]) {
  return langs.length > 0 ? langs : [...locale.options];
}

/** Builds an import-compatible requirements document for announcement requests. */
function buildRequirementFile(requests: unknown[]) {
  return {
    schema:           'tcg.cards.hearthstone.card-image-requirements.v1',
    exportId:         crypto.randomUUID(),
    imageSpecVersion: 'v1',
    generatedAt:      new Date().toISOString(),
    toolContract:     { inputFormat: 'json', outputArchiveFormat: 'zip', outputImageFormat: 'png', fileNamePolicy: 'exact' },
    limits:           { defaultMaxRequests: requests.length, hardMaxRequests: requests.length, maxRequests: requests.length, requestCount: requests.length, remainingEstimate: 0 },
    batch:            { index: 1, cursor: null, hasMore: false },
    defaults:         { png: { color: 'rgba', transparentBackground: true }, target: { contentType: 'image/webp', webpPreset: 'q86-m4-fast' } },
    requests,
  };
}

export const getRenderRequests = os
  .input(itemOperationInput)
  .output(z.object({ entries: z.array(z.object({ side: z.string(), lang: z.string(), request: z.any().optional(), error: z.string().optional() })), requirements: z.any() }))
  .handler(async ({ input }) => {
    const entries = await prepareItemRequests(input.item, input, resolveLangs(input.langs));
    const requests = entries.flatMap(entry => entry.request ? [entry.request] : []);
    return {
      entries:      entries.map(entry => ({ side: entry.side, lang: entry.lang, request: entry.request, error: entry.error })),
      requirements: buildRequirementFile(requests),
    };
  });

export const previewItem = os
  .input(itemOperationInput)
  .output(z.object({ files: z.array(z.object({ side: z.string(), lang: z.string(), fileName: z.string(), base64: z.string().optional(), error: z.string().optional() })) }))
  .handler(async ({ input }) => {
    const entries = await prepareItemRequests(input.item, input, resolveLangs(input.langs));
    const files = [];
    for (const entry of entries) {
      if (!entry.request) {
        files.push({ side: entry.side, lang: entry.lang, fileName: '', error: entry.error });
        continue;
      }
      try {
        const bytes = await renderPreparedRequest(entry);
        files.push({ side: entry.side, lang: entry.lang, fileName: entry.request.output.fileName, base64: Buffer.from(bytes).toString('base64') });
      } catch (error) {
        files.push({ side: entry.side, lang: entry.lang, fileName: entry.request.output.fileName, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { files };
  });

export const downloadItemImages = os
  .input(itemOperationInput)
  .output(z.object({ files: z.array(z.object({ fileName: z.string(), base64: z.string() })), archive: z.object({ fileName: z.string(), base64: z.string() }).nullable(), errors: z.array(z.string()) }))
  .handler(async ({ input }) => {
    const entries = await prepareItemRequests(input.item, input, resolveLangs(input.langs));
    const files: Array<{ fileName: string, base64: string }> = [];
    const rawFiles: Array<{ fileName: string, bytes: Uint8Array }> = [];
    const errors: string[] = [];
    for (const entry of entries) {
      if (!entry.request) {
        errors.push(`${entry.side}/${entry.lang}: ${entry.error ?? '无法构建请求'}`);
        continue;
      }
      try {
        const bytes = await renderPreparedRequest(entry);
        const fileName = `${entry.side}-${entry.lang}-${entry.request.output.fileName}`;
        rawFiles.push({ fileName, bytes });
        files.push({ fileName, base64: Buffer.from(bytes).toString('base64') });
      } catch (error) {
        errors.push(`${entry.side}/${entry.lang}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (input.langs.length > 0 || rawFiles.length === 0) return { files, archive: null, errors };

    const dir = await mkdtemp(join(tmpdir(), 'announcement-images-'));
    try {
      const paths: string[] = [];
      for (const file of rawFiles) {
        const path = join(dir, file.fileName);
        await Bun.write(path, file.bytes);
        paths.push(path);
      }
      const fileName = `${input.item.cardId ?? 'announcement'}-images.zip`;
      const archivePath = join(dir, fileName);
      const process = Bun.spawn(['zip', '-j', archivePath, ...paths]);
      if (await process.exited !== 0) throw new Error('创建 ZIP 失败');
      const bytes = new Uint8Array(await Bun.file(archivePath).arrayBuffer());
      return { files: [], archive: { fileName, base64: Buffer.from(bytes).toString('base64') }, errors };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

export const previewImage = os
  .route({
    method:      'POST',
    description: 'Read a rendered announcement card image from local bucket as base64',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(previewImageSchema)
  .output(z.object({ base64: z.string() }))
  .handler(async ({ input }) => {
    const bucketDir = requireHearthstoneImageBucketDir();
    const prefix = input.renderHash.slice(0, 2);
    const filePath = join(bucketDir, 'hearthstone', 'card', input.category, 'hand', input.template, 'normal', prefix, `${input.renderHash}.webp`);

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      throw new ORPCError('NOT_FOUND', { message: `Rendered image not found: ${filePath}` });
    }

    const bytes = await file.arrayBuffer();
    return { base64: Buffer.from(new Uint8Array(bytes)).toString('base64') };
  });

export const getItemImages = os
  .route({
    method:      'POST',
    description: 'Return existing rendered images for announcement items (no rendering)',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    items:       itemInput.array(),
    version:     z.number().int(),
    lastVersion: z.number().int().nullable().optional(),
    langs:       locale.array().default([]),
  }))
  .output(z.object({
    images: z.array(z.object({
      itemKey:  z.string(),
      cardId:   z.string(),
      side:     z.string(),
      lang:     z.string(),
      base64:   z.string().nullable(),
      category: z.string(),
      template: z.string(),
      error:    z.string().optional(),
    })),
  }))
  .handler(async ({ input }) => {
    const cardItems = input.items.filter(i =>
      RENDERABLE_TYPES.includes(i.type as typeof RENDERABLE_TYPES[number]) && i.cardId,
    );

    const langs = input.langs.length > 0
      ? input.langs
      : [...locale.options];

    const hashes = await checkItemImages(cardItems, {
      version:     input.version,
      lastVersion: input.lastVersion,
    }, langs);

    const bucketDir = requireHearthstoneImageBucketDir();

    return {
      images: await Promise.all(hashes.map(async h => {
        const prefix = h.hash.slice(0, 2);
        const filePath = join(bucketDir, 'hearthstone', 'card', h.category, 'hand', h.template, 'normal', prefix, `${h.hash}.webp`);

        try {
          const file = Bun.file(filePath);
          if (await file.exists()) {
            const bytes = await file.arrayBuffer();
            return {
              itemKey:  h.itemKey, cardId:   h.cardId, side:     h.side, lang:     h.lang,
              base64:   Buffer.from(new Uint8Array(bytes)).toString('base64'),
              category: h.category, template: h.template,
            };
          }
        } catch { /* not found */ }

        return {
          itemKey:  h.itemKey, cardId:   h.cardId, side:     h.side, lang:     h.lang,
          base64:   null, category: h.category, template: h.template, error:    h.error,
        };
      })),
    };
  });

export const renderItems = os
  .route({
    method:      'POST',
    description: 'Render announcement items (card images with delta/glow)',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    items:       itemInput.array(),
    version:     z.number().int(),
    lastVersion: z.number().int().nullable().optional(),
    langs:       locale.array().default([]),
  }))
  .output(z.object({
    results: z.array(z.object({
      itemKey:    z.string(),
      cardId:     z.string(),
      side:       z.string(),
      lang:       z.string(),
      renderHash: z.string(),
      category:   z.string(),
      skipped:    z.boolean(),
      error:      z.string().optional(),
    })),
  }))
  .handler(async ({ input }) => {
    const cardItems = input.items.filter(i =>
      RENDERABLE_TYPES.includes(i.type as typeof RENDERABLE_TYPES[number]) && i.cardId,
    );

    console.log('[renderItems] received', { count: cardItems.length, version: input.version, langs: input.langs });

    const langs = input.langs.length > 0
      ? input.langs
      : [...locale.options];

    const results = await renderAllItems(cardItems, {
      version:     input.version,
      lastVersion: input.lastVersion,
    }, langs);

    console.log('[renderItems] done', results.map(r => ({ side: r.side, hash: r.renderHash?.slice(0, 8), error: r.error, skipped: r.skipped })));

    return {
      results: results.map(r => ({
        itemKey:    r.itemKey,
        cardId:     r.cardId,
        side:       r.side,
        lang:       r.lang,
        renderHash: r.renderHash,
        category:   r.category,
        skipped:    r.skipped,
        error:      r.error,
      })),
    };
  });
