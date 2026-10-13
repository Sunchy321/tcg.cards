import { z } from 'zod';

import { ImageImportBatch } from '@tcg-cards/db/schema/local/shadowverse';
import { createDefinition } from '#task/definition';

import {
  buildImageAssetPlan,
  finalizeImageImportBatch,
  markInterruptedImageImportBatches,
  processImageAsset,
} from '../../image-import';
import { shadowverseImageSource } from '../../image-config';
import { getShadowverseLocalDb } from '../../shadowverse-local-db';

import type { PlannedImageAsset } from '../../image-import';
import type { ImageImportCounters } from '../../image-import';

/** Per-run state shared across task stages. */
interface ImageImportContext {
  batchId: string | null;
  assets: PlannedImageAsset[];
}

/** Durable block cursor carrying the running download counters. */
interface ImageImportCursor extends ImageImportCounters {
  index: number;
}

const CHUNK_SIZE = 25;

/** All current card image assets downloaded into the local bucket with hash-based skipping. */
export const imageImportTaskDefinition = createDefinition('shadowverse_images_import', { version: '2026-08-30:v1' })
  .scope(
    z.object({}),
    { type: 'shadowverse_images_import' as const, resolve: () => ({ key: 'global', snapshot: {} }) },
  )
  .input(z.strictObject({}))
  .output(z.strictObject({
    assetCount: z.number(),
    status: z.string(),
    downloadedCount: z.number(),
    skippedCount: z.number(),
    missingCount: z.number(),
    failedCount: z.number(),
    downloadedByteCount: z.number(),
  }))
  .context({
    init: (): ImageImportContext => ({
      batchId: null,
      assets: [],
    }),
  })

  .stage('importing', { label: '下载并导入卡图', progressMode: 'bounded', resumeMode: 'durable' })
    .entry(async ({ ctx }) => {
      const db = getShadowverseLocalDb();
      await markInterruptedImageImportBatches(db);

      const batch = await db.insert(ImageImportBatch)
        .values({ source: shadowverseImageSource })
        .returning()
        .then(rows => rows[0]);

      if (batch == null) {
        throw new Error('Image import batch creation did not return a batch ID.');
      }

      ctx.batchId = batch.id;
      ctx.assets = await buildImageAssetPlan(db);

      return {
        total: ctx.assets.length,
        blockInput: {
          index: 0,
          downloadedCount: 0,
          skippedCount: 0,
          missingCount: 0,
          failedCount: 0,
          downloadedByteCount: 0,
        } satisfies ImageImportCursor,
      };
    })
    .block(async ({ ctx, blockInput, progress, done }) => {
      const db = getShadowverseLocalDb();
      const batchId = ctx.batchId!;

      if (blockInput.index >= ctx.assets.length) {
        return done(blockInput);
      }

      const cursor: ImageImportCursor = { ...blockInput };

      for (const asset of ctx.assets.slice(cursor.index, cursor.index + CHUNK_SIZE)) {
        const { outcome, byteSize } = await processImageAsset(db, batchId, asset);

        if (outcome === 'downloaded') {
          cursor.downloadedCount += 1;
          cursor.downloadedByteCount += byteSize;
        }
        if (outcome === 'skipped') cursor.skippedCount += 1;
        if (outcome === 'missing') cursor.missingCount += 1;
        if (outcome === 'failed') cursor.failedCount += 1;
      }

      cursor.index += CHUNK_SIZE;

      progress({
        done: Math.min(cursor.index, ctx.assets.length),
        total: ctx.assets.length,
      });

      if (cursor.index >= ctx.assets.length) {
        return done(cursor);
      }

      return cursor;
    })
    .exit(async ({ ctx, blockInput }) => {
      const db = getShadowverseLocalDb();
      const batch = await finalizeImageImportBatch({
        db,
        batchId: ctx.batchId!,
        counters: {
          downloadedCount: blockInput.downloadedCount,
          skippedCount: blockInput.skippedCount,
          missingCount: blockInput.missingCount,
          failedCount: blockInput.failedCount,
          downloadedByteCount: blockInput.downloadedByteCount,
        },
        assetCount: ctx.assets.length,
      });

      return {
        assetCount: ctx.assets.length,
        status: batch?.status ?? 'failed',
        downloadedCount: blockInput.downloadedCount,
        skippedCount: blockInput.skippedCount,
        missingCount: blockInput.missingCount,
        failedCount: blockInput.failedCount,
        downloadedByteCount: blockInput.downloadedByteCount,
      };
    })
  .build();
