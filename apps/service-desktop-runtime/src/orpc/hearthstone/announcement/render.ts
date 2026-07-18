import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { join } from 'node:path';

import { checkItemImages, renderAllItems } from '../../../lib/hearthstone/announcement/render';
import { requireHearthstoneImageBucketDir } from '../../../lib/hearthstone/image-config';
import { locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

const RENDERABLE_TYPES = ['card_change', 'card_update'] as const;

const itemInput = z.object({
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
      : locale.array().parse(['en', 'zhs']);

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
              cardId:   h.cardId, side:     h.side, lang:     h.lang,
              base64:   Buffer.from(new Uint8Array(bytes)).toString('base64'),
              category: h.category, template: h.template,
            };
          }
        } catch { /* not found */ }

        return {
          cardId:   h.cardId, side:     h.side, lang:     h.lang,
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
      : locale.array().parse(['en', 'zhs']);

    const results = await renderAllItems(cardItems, {
      version:     input.version,
      lastVersion: input.lastVersion,
    }, langs);

    console.log('[renderItems] done', results.map(r => ({ side: r.side, hash: r.renderHash?.slice(0, 8), error: r.error, skipped: r.skipped })));

    return {
      results: results.map(r => ({
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
