import { z } from 'zod';

import { EvolveImageImportBatch } from '@tcg-cards/db/schema/local/shadowverse';
import { createDefinition } from '#task/definition';

import {
  buildEvolveImagePlan,
  finalizeEvolveImageImportBatch,
  markInterruptedEvolveImageBatches,
  processEvolveImageAsset,
} from '../../image-import';
import { evolveImageSource } from '../../image-config';
import { getShadowverseEvolveLocalDb } from '../../shadowverse-evolve-local-db';

import type { PlannedEvolveImage } from '../../image-import';
import type { EvolveImageImportCounters } from '../../image-import';

/** Per-run state shared across task stages. */
interface EvolveImagesImportContext {
  batchId: string | null;
  assets: PlannedEvolveImage[];
}

/** Durable block cursor carrying the running download counters. */
interface EvolveImagesImportCursor extends EvolveImageImportCounters {
  index: number;
}

const CHUNK_SIZE = 25;

/** All current Evolve card images downloaded into the local bucket with existence-based skipping. */
export const evolveImagesImportTaskDefinition = createDefinition('shadowverse_evolve_images_import', { version: '2026-08-30:v1' })
  .scope(
    z.object({}),
    { type: 'shadowverse_evolve_images_import' as const, resolve: () => ({ key: 'global', snapshot: {} }) },
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
    init: (): EvolveImagesImportContext => ({
      batchId: null,
      assets: [],
    }),
  })

  .stage('importing', { label: '下载并导入卡图', progressMode: 'bounded', resumeMode: 'durable' })
    .entry(async ({ ctx }) => {
      const db = getShadowverseEvolveLocalDb();
      await markInterruptedEvolveImageBatches(db);

      const batch = await db.insert(EvolveImageImportBatch)
        .values({ source: evolveImageSource })
        .returning()
        .then(rows => rows[0]);

      if (batch == null) {
        throw new Error('Image import batch creation did not return a batch ID.');
      }

      ctx.batchId = batch.id;
      ctx.assets = await buildEvolveImagePlan(db);

      return {
        total: ctx.assets.length,
        blockInput: {
          index: 0,
          downloadedCount: 0,
          skippedCount: 0,
          missingCount: 0,
          failedCount: 0,
          downloadedByteCount: 0,
        } satisfies EvolveImagesImportCursor,
      };
    })
    .block(async ({ ctx, blockInput, progress, done }) => {
      const db = getShadowverseEvolveLocalDb();
      const batchId = ctx.batchId!;

      if (blockInput.index >= ctx.assets.length) {
        return done(blockInput);
      }

      const cursor: EvolveImagesImportCursor = { ...blockInput };

      for (const asset of ctx.assets.slice(cursor.index, cursor.index + CHUNK_SIZE)) {
        const { outcome, byteSize } = await processEvolveImageAsset(db, batchId, asset);

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
      const db = getShadowverseEvolveLocalDb();
      const batch = await finalizeEvolveImageImportBatch({
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
