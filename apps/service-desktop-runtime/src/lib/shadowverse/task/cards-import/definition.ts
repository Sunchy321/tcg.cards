import { z } from 'zod';

import { ImportBatch } from '@tcg-cards/db/schema/local/shadowverse';
import { createDefinition } from '#task/definition';

import {
  downloadLangSnapshot,
  importLangs,
  shadowverseCardsSource,
  shadowverseCardsUrl,
} from '../../cards-source';
import {
  finalizeImportBatch,
  importLangSnapshot,
  markInterruptedImportBatches,
  softDeleteMissingCards,
} from '../../cards-import';
import { getShadowverseLocalDb } from '../../shadowverse-local-db';

import type { NormalizedLangSnapshot } from '../../cards-source';
import type { ShadowverseLang } from '#model/shadowverse/schema/data/card-list';

/** Per-run state shared across task stages. */
interface CardsImportContext {
  batchId: string | null;
  snapshots: Partial<Record<ShadowverseLang, NormalizedLangSnapshot>> | null;
}

/** Durable block cursor carrying the running per-card counters. */
interface CardsImportCursor {
  langIndex: number;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

/** Full five-language official card list downloaded and imported into the local build database. */
export const cardsImportTaskDefinition = createDefinition('shadowverse_cards_import', { version: '2026-08-30:v1' })
  .scope(
    z.object({}),
    { type: 'shadowverse_cards_import' as const, resolve: () => ({ key: 'global', snapshot: {} }) },
  )
  .input(z.strictObject({}))
  .output(z.strictObject({
    cardCount: z.number(),
    status: z.string(),
    addedCount: z.number(),
    updatedCount: z.number(),
    skippedCount: z.number(),
    failedCount: z.number(),
    softDeletedCount: z.number(),
  }))
  .context({
    init: (): CardsImportContext => ({
      batchId: null,
      snapshots: null,
    }),
  })

  .stage('fetching', { label: '拉取官方五语言卡牌数据', progressMode: 'simple' })
    .handler(async ({ ctx }) => {
      const db = getShadowverseLocalDb();
      await markInterruptedImportBatches(db);

      const batch = await db.insert(ImportBatch)
        .values({ source: shadowverseCardsSource, sourceUrl: shadowverseCardsUrl })
        .returning()
        .then(rows => rows[0]);

      if (batch == null) {
        throw new Error('Import batch creation did not return a batch ID.');
      }

      ctx.batchId = batch.id;

      const snapshots: Partial<Record<ShadowverseLang, NormalizedLangSnapshot>> = {};
      for (const lang of importLangs) {
        snapshots[lang] = await downloadLangSnapshot(lang);
      }
      ctx.snapshots = snapshots;

      return null;
    })

  .stage('importing', { label: '导入卡牌数据', progressMode: 'bounded', resumeMode: 'durable' })
    .entry(async ({ ctx }) => {
      const snapshots = ctx.snapshots!;
      const langs = importLangs as readonly ShadowverseLang[];
      const cardCount = snapshots[langs[0]!]?.cards.length ?? 0;

      return {
        total: langs.length * cardCount,
        blockInput: {
          langIndex: 0,
          addedCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        } satisfies CardsImportCursor,
      };
    })
    .block(async ({ ctx, blockInput, progress, done }) => {
      const db = getShadowverseLocalDb();
      const batchId = ctx.batchId!;
      const langs = importLangs as readonly ShadowverseLang[];
      const snapshots = ctx.snapshots!;

      if (blockInput.langIndex >= langs.length) {
        return done(blockInput);
      }

      const lang = langs[blockInput.langIndex]!;
      const snapshot = snapshots[lang]!;
      const isCorePass = blockInput.langIndex === 0;
      const counters = await importLangSnapshot({
        db,
        batchId,
        snapshot,
        isCorePass,
        onProgress: progressUpdate => {
          progress({
            done: blockInput.langIndex * snapshot.cards.length + (progressUpdate.completedCount ?? 0),
            total: langs.length * snapshot.cards.length,
          });
        },
      });

      const next: CardsImportCursor = {
        langIndex: blockInput.langIndex + 1,
        addedCount: blockInput.addedCount + counters.addedCount,
        updatedCount: blockInput.updatedCount + counters.updatedCount,
        skippedCount: blockInput.skippedCount + counters.skippedCount,
        failedCount: blockInput.failedCount + counters.failedCount,
      };

      if (next.langIndex >= langs.length) {
        return done(next);
      }

      return next;
    })
    .exit(async ({ ctx, blockInput }) => {
      const db = getShadowverseLocalDb();
      const snapshots = ctx.snapshots!;
      const langs = importLangs as readonly ShadowverseLang[];
      const seenCardIds = new Set<number>();

      for (const lang of langs) {
        for (const card of snapshots[lang]!.cards) {
          seenCardIds.add(card.cardId);
        }
      }

      const unknownFields = [...new Set(langs.flatMap(lang => snapshots[lang]!.unknownFields))].sort();
      const softDeletedCount = await softDeleteMissingCards(db, seenCardIds);
      const batch = await finalizeImportBatch({
        db,
        batchId: ctx.batchId!,
        counters: {
          addedCount: blockInput.addedCount,
          updatedCount: blockInput.updatedCount,
          skippedCount: blockInput.skippedCount,
          failedCount: blockInput.failedCount,
        },
        sourceRecordCount: seenCardIds.size,
        unknownFields,
        softDeletedCount,
      });

      return {
        cardCount: seenCardIds.size,
        status: batch?.status ?? 'failed',
        addedCount: blockInput.addedCount,
        updatedCount: blockInput.updatedCount,
        skippedCount: blockInput.skippedCount,
        failedCount: blockInput.failedCount,
        softDeletedCount,
      };
    })
  .build();
