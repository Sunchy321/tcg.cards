import { z } from 'zod';

import { EvolveImportBatch } from '@tcg-cards/db/schema/local/shadowverse';
import { createDefinition } from '#task/definition';

import {
  downloadEnCardNos,
  downloadJaCardNos,
  evolveEnSource,
  evolveJaSource,
  evolveSourceUrl,
  finalizeEvolveImportBatch,
  importEvolveEnCard,
  importEvolveJaCard,
  importEvolveZhBatch,
  markInterruptedEvolveImportBatches,
  softDeleteMissingEvolveCards,
} from '../../cards-import';
import { downloadSveCardList } from '../../svehelper-source';
import { getShadowverseEvolveLocalDb } from '../../shadowverse-evolve-local-db';

import type { SveCardListItem } from '#model/shadowverse/schema/data/evolve-card-list';

/** Per-run state shared across task stages. */
interface EvolveCardsImportContext {
  batchId: string | null;
  jaCardNos: string[];
  enCardNos: string[];
  zhCards: SveCardListItem[];
}

type ImportPhase = 'ja' | 'en' | 'zh';

/** Durable block cursor carrying the phase, position, and running per-card counters. */
interface EvolveCardsImportCursor {
  phase: ImportPhase;
  index: number;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

const CHUNK_SIZE = 20;

/** Advances one cursor past a processed chunk, skipping phases with no work. */
export function advanceCursor(
  cursor: EvolveCardsImportCursor,
  processed: number,
  totals: { ja: number, en: number, zh: number },
): { cursor: EvolveCardsImportCursor, finished: boolean } {
  const next: EvolveCardsImportCursor = { ...cursor, index: cursor.index + processed };
  const phaseTotals: Record<ImportPhase, number> = { ja: totals.ja, en: totals.en, zh: totals.zh };

  while (next.phase !== 'zh' && next.index >= phaseTotals[next.phase]) {
    next.phase = next.phase === 'ja' ? 'en' : 'zh';
    next.index = 0;
  }

  const finished = next.phase === 'zh' && next.index >= totals.zh;
  return { cursor: next, finished };
}

/** Cards completed so far across all phases, for bounded progress reporting. */
function completedCount(cursor: EvolveCardsImportCursor, totals: { ja: number, en: number, zh: number }) {
  if (cursor.phase === 'ja') return Math.min(cursor.index, totals.ja);
  if (cursor.phase === 'en') return totals.ja + Math.min(cursor.index, totals.en);
  return totals.ja + totals.en + Math.min(cursor.index, totals.zh);
}

/** Full three-source Evolve card list downloaded and imported into the local build database. */
export const evolveCardsImportTaskDefinition = createDefinition('shadowverse_evolve_cards_import', { version: '2026-08-30:v1' })
  .scope(
    z.object({}),
    { type: 'shadowverse_evolve_cards_import' as const, resolve: () => ({ key: 'global', snapshot: {} }) },
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
    init: (): EvolveCardsImportContext => ({
      batchId: null,
      jaCardNos: [],
      enCardNos: [],
      zhCards: [],
    }),
  })

  .stage('fetching', { label: '拉取官方目录（日/英/简中）', progressMode: 'simple' })
    .handler(async ({ ctx }) => {
      const db = getShadowverseEvolveLocalDb();
      await markInterruptedEvolveImportBatches(db);

      const batch = await db.insert(EvolveImportBatch)
        .values({ source: evolveJaSource, sourceUrl: evolveSourceUrl })
        .returning()
        .then(rows => rows[0]);

      if (batch == null) {
        throw new Error('Import batch creation did not return a batch ID.');
      }

      ctx.batchId = batch.id;
      ctx.jaCardNos = await downloadJaCardNos();
      ctx.enCardNos = await downloadEnCardNos();
      ctx.zhCards = await downloadSveCardList();

      return null;
    })

  .stage('importing', { label: '导入卡牌数据', progressMode: 'bounded', resumeMode: 'durable' })
    .entry(async ({ ctx }) => {
      const totals = { ja: ctx.jaCardNos.length, en: ctx.enCardNos.length, zh: ctx.zhCards.length };

      return {
        total: totals.ja + totals.en + totals.zh,
        blockInput: {
          phase: 'ja' as ImportPhase,
          index: 0,
          addedCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        } satisfies EvolveCardsImportCursor,
      };
    })
    .block(async ({ ctx, blockInput, progress, done }) => {
      const db = getShadowverseEvolveLocalDb();
      const batchId = ctx.batchId!;
      const totals = { ja: ctx.jaCardNos.length, en: ctx.enCardNos.length, zh: ctx.zhCards.length };
      const counters = {
        addedCount: blockInput.addedCount,
        updatedCount: blockInput.updatedCount,
        skippedCount: blockInput.skippedCount,
        failedCount: blockInput.failedCount,
      };

      if (blockInput.phase === 'ja') {
        const chunk = ctx.jaCardNos.slice(blockInput.index, blockInput.index + CHUNK_SIZE);

        for (const cardNo of chunk) {
          await importEvolveJaCard(db, batchId, cardNo, counters);
        }
      } else if (blockInput.phase === 'en') {
        const chunk = ctx.enCardNos.slice(blockInput.index, blockInput.index + CHUNK_SIZE);

        for (const enCardNo of chunk) {
          await importEvolveEnCard(db, batchId, enCardNo, counters);
        }
      } else {
        // zh phase: the bulk list was fetched during enumeration, so this block applies
        // every remaining row in one pass without any network requests.
        const remaining = totals.zh - blockInput.index;
        await importEvolveZhBatch(db, batchId, ctx.zhCards.slice(blockInput.index), counters);

        const { cursor: next, finished } = advanceCursor(blockInput, remaining, totals);
        next.addedCount = counters.addedCount;
        next.updatedCount = counters.updatedCount;
        next.skippedCount = counters.skippedCount;
        next.failedCount = counters.failedCount;

        progress({ done: Math.min(completedCount(next, totals), totals.ja + totals.en + totals.zh), total: totals.ja + totals.en + totals.zh });

        if (finished) {
          return done(next);
        }

        return next;
      }

      const { cursor: next, finished } = advanceCursor(blockInput, CHUNK_SIZE, totals);
      next.addedCount = counters.addedCount;
      next.updatedCount = counters.updatedCount;
      next.skippedCount = counters.skippedCount;
      next.failedCount = counters.failedCount;

      progress({ done: Math.min(completedCount(next, totals), totals.ja + totals.en + totals.zh), total: totals.ja + totals.en + totals.zh });

      if (finished) {
        return done(next);
      }

      return next;
    })
    .exit(async ({ ctx, blockInput }) => {
      const db = getShadowverseEvolveLocalDb();
      const seenCardNos = new Set(ctx.jaCardNos);
      const softDeletedCount = await softDeleteMissingEvolveCards(db, seenCardNos);
      const batch = await finalizeEvolveImportBatch({
        db,
        batchId: ctx.batchId!,
        counters: {
          addedCount: blockInput.addedCount,
          updatedCount: blockInput.updatedCount,
          skippedCount: blockInput.skippedCount,
          failedCount: blockInput.failedCount,
        },
        sourceRecordCount: seenCardNos.size,
        softDeletedCount,
      });

      return {
        cardCount: seenCardNos.size,
        status: batch?.status ?? 'failed',
        addedCount: blockInput.addedCount,
        updatedCount: blockInput.updatedCount,
        skippedCount: blockInput.skippedCount,
        failedCount: blockInput.failedCount,
        softDeletedCount,
      };
    })
  .build();
