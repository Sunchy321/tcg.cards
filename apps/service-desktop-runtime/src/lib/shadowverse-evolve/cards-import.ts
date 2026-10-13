import { and, desc, eq, isNull } from 'drizzle-orm';

import {
  EvolveCard,
  EvolveCardLocalization,
  EvolveCardQuestion,
  EvolveCardSet,
  EvolveImportBatch,
  EvolveImportFailure,
  EvolveImportState,
} from '@tcg-cards/db/schema/local/shadowverse';

import {
  downloadEnCardDetail,
  downloadEnCardNos,
  enCardNoToJaCardNo,
  evolveEnSource,
} from './en-official-source';
import {
  downloadJaCardDetail,
  downloadJaCardNos,
  evolveJaSource,
} from './ja-official-source';
import {
  downloadSveCardList,
  evolveZhSource,
} from './svehelper-source';
import { getShadowverseEvolveLocalDb } from './shadowverse-evolve-local-db';

import type { ShadowverseEvolveLocalDb } from './shadowverse-evolve-local-db';
import type { ParsedEvolveDetail } from './ja-official-source';
import type { SveCardListItem } from '#model/shadowverse/schema/data/evolve-card-list';

/** Optional progress update emitted during one desktop import. */
export interface EvolveImportProgress {
  phase: string;
  message: string;
  completedCount?: number;
  totalCount?: number;
}

/** Import batch summary returned to desktop clients. */
export interface EvolveImportReport {
  batchId: string;
  source: string;
  sourceUrl: string;
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'interrupted';
  sourceRecordCount: number;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  softDeletedCount: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** Running per-card counters threaded through the import blocks. */
export interface EvolveImportCounters {
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

export const evolveSourceUrl = 'https://shadowverse-evolve.com/cardlist/cardsearch';

/** Unknown thrown value converted into a concise error message. */
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Interrupted batches marked before a new desktop import begins. */
export async function markInterruptedEvolveImportBatches(db: ShadowverseEvolveLocalDb) {
  const now = new Date();

  await db.update(EvolveImportBatch)
    .set({ status: 'interrupted', error: 'Desktop import process ended before completion.', completedAt: now, updatedAt: now })
    .where(eq(EvolveImportBatch.status, 'running'));
}

/** One failure inserted or replaced for the current batch. */
export async function recordEvolveImportFailure(
  db: ShadowverseEvolveLocalDb,
  batchId: string,
  sourceRecordId: string,
  stage: string,
  code: string,
  message: string,
  payload: Record<string, unknown> | null = null,
) {
  await db.insert(EvolveImportFailure).values({
    batchId,
    sourceRecordId,
    stage,
    code,
    message,
    payload,
  }).onConflictDoUpdate({
    target: [EvolveImportFailure.batchId, EvolveImportFailure.sourceRecordId],
    set: { stage, code, message, payload },
  });
}

/** Card pack row upserted from one card's product information. */
async function applyEvolveCardSet(
  db: ShadowverseEvolveLocalDb,
  cardSetCode: string,
  name: string,
  releaseDate: string | null,
) {
  await db.insert(EvolveCardSet)
    .values({ cardSetCode, name, releaseDate })
    .onConflictDoUpdate({
      target: EvolveCardSet.cardSetCode,
      set: { name, releaseDate, deletedAt: null },
    });
}

/** Whether the stored core card row already matches the parsed payload exactly. */
function evolveCardUnchanged(existing: typeof EvolveCard.$inferSelect, values: typeof EvolveCard.$inferInsert) {
  return existing.cardSetCode === values.cardSetCode
    && existing.craft === values.craft
    && existing.cardType === values.cardType
    && existing.tribes === values.tribes
    && existing.rarity === values.rarity
    && existing.cost === values.cost
    && existing.attack === values.attack
    && existing.life === values.life
    && existing.imageUrlJa === values.imageUrlJa
    && JSON.stringify(existing.relatedCardNos ?? []) === JSON.stringify(values.relatedCardNos ?? [])
    && existing.deletedAt == null;
}

/** One card's language-independent core row inserted or updated; reports the action taken. */
async function applyEvolveCard(
  db: ShadowverseEvolveLocalDb,
  detail: ParsedEvolveDetail,
): Promise<'added' | 'updated' | 'skipped'> {
  const values = {
    cardNo: detail.cardNo,
    cardSetCode: detail.cardNo.split('-')[0] ?? null,
    craft: detail.craft,
    cardType: detail.cardType,
    tribes: detail.tribes,
    rarity: detail.rarity,
    cost: detail.cost,
    attack: detail.attack,
    life: detail.life,
    relatedCardNos: detail.relatedCardNos.length > 0 ? detail.relatedCardNos : null,
    imageUrlJa: detail.imageUrl,
  };

  const existing = await db.select()
    .from(EvolveCard)
    .where(eq(EvolveCard.cardNo, detail.cardNo))
    .limit(1)
    .then(rows => rows[0] ?? null);

  if (existing == null) {
    await db.insert(EvolveCard).values(values);
    return 'added';
  }

  if (evolveCardUnchanged(existing, values)) {
    return 'skipped';
  }

  await db.update(EvolveCard)
    .set({ ...values, deletedAt: null })
    .where(eq(EvolveCard.cardNo, detail.cardNo));

  return 'updated';
}

/** Localization column values for one parsed card detail. */
function evolveLocalizationValues(detail: ParsedEvolveDetail) {
  return {
    name: detail.name,
    skillText: detail.skillText,
    flavourText: detail.flavourText,
    illustrator: detail.illustrator,
  };
}

/** One card localization for one language upserted. */
async function applyEvolveLocalization(
  db: ShadowverseEvolveLocalDb,
  lang: string,
  detail: ParsedEvolveDetail,
) {
  const values = evolveLocalizationValues(detail);

  await db.insert(EvolveCardLocalization)
    .values({ cardNo: detail.cardNo, lang, ...values })
    .onConflictDoUpdate({
      target: [EvolveCardLocalization.cardNo, EvolveCardLocalization.lang],
      set: values,
    });
}

/** One card's official Q&A entries replaced with the freshly parsed set. */
async function applyEvolveQuestions(
  db: ShadowverseEvolveLocalDb,
  detail: ParsedEvolveDetail,
) {
  await db.delete(EvolveCardQuestion)
    .where(eq(EvolveCardQuestion.cardNo, detail.cardNo));

  if (detail.questions.length === 0) {
    return;
  }

  await db.insert(EvolveCardQuestion).values(detail.questions.map(entry => ({
    id: entry.id,
    cardNo: detail.cardNo,
    question: entry.question,
    answer: entry.answer,
    answeredAt: entry.answeredAt,
  })));
}

/** One zh (SVE Helper) card row applied as a localization on top of the ja core card. */
async function applyEvolveZhCard(db: ShadowverseEvolveLocalDb, card: SveCardListItem) {
  if (card.name_cn == null || card.name_cn.trim().length === 0) {
    return 'skipped' as const;
  }

  const values = {
    name: card.name_cn.trim(),
    skillText: card.desc_cn ?? null,
    flavourText: null,
    illustrator: null,
  };

  await db.insert(EvolveCardLocalization)
    .values({ cardNo: card.card_no, lang: 'zh-cn', ...values })
    .onConflictDoUpdate({
      target: [EvolveCardLocalization.cardNo, EvolveCardLocalization.lang],
      set: values,
    });

  return 'applied' as const;
}

/** One JA card fetched and imported atomically enough: core, localization, and Q&A. */
export async function importEvolveJaCard(
  db: ShadowverseEvolveLocalDb,
  batchId: string,
  cardNo: string,
  counters: EvolveImportCounters,
): Promise<'added' | 'updated' | 'skipped' | 'failed'> {
  try {
    const detail = await downloadJaCardDetail(cardNo);

    await db.insert(EvolveCardSet)
      .values({
        cardSetCode: detail.cardNo.split('-')[0] ?? cardNo,
        name: detail.product ?? cardNo,
        releaseDate: detail.releaseDate,
      })
      .onConflictDoUpdate({
        target: EvolveCardSet.cardSetCode,
        set: { name: detail.product ?? cardNo, releaseDate: detail.releaseDate, deletedAt: null },
      });

    const action = await applyEvolveCard(db, detail);
    await applyEvolveLocalization(db, 'ja', detail);
    await applyEvolveQuestions(db, detail);

    if (action === 'added') counters.addedCount += 1;
    if (action === 'updated') counters.updatedCount += 1;
    if (action === 'skipped') counters.skippedCount += 1;

    return action;
  } catch (error) {
    await recordEvolveImportFailure(db, batchId, `${cardNo}:ja`, 'write', 'IMPORT', getErrorMessage(error), { cardNo });
    counters.failedCount += 1;
    return 'failed';
  }
}

/** One EN card fetched and imported as an overlay localization on its JA card number. */
export async function importEvolveEnCard(
  db: ShadowverseEvolveLocalDb,
  batchId: string,
  enCardNo: string,
  counters: EvolveImportCounters,
): Promise<'applied' | 'skipped' | 'failed'> {
  const jaCardNo = enCardNoToJaCardNo(enCardNo);

  if (jaCardNo == null) {
    await recordEvolveImportFailure(db, batchId, `${enCardNo}:en`, 'validation', 'UNMAPPED_CARD_NO', `EN card number ${enCardNo} has no EN suffix.`, { enCardNo });
    counters.failedCount += 1;
    return 'failed';
  }

  try {
    const detail = await downloadEnCardDetail(enCardNo);
    await applyEvolveLocalization(db, 'en', { ...detail, cardNo: jaCardNo });

    if (detail.imageUrl != null) {
      await db.update(EvolveCard)
        .set({ imageUrlEn: detail.imageUrl })
        .where(eq(EvolveCard.cardNo, jaCardNo));
    }

    return 'applied';
  } catch (error) {
    await recordEvolveImportFailure(db, batchId, `${enCardNo}:en`, 'write', 'IMPORT', getErrorMessage(error), { enCardNo, jaCardNo });
    counters.failedCount += 1;
    return 'failed';
  }
}

/** One batch of zh rows imported as overlay localizations. */
export async function importEvolveZhBatch(
  db: ShadowverseEvolveLocalDb,
  batchId: string,
  cards: SveCardListItem[],
  counters: EvolveImportCounters,
) {
  for (const card of cards) {
    try {
      await applyEvolveZhCard(db, card);
    } catch (error) {
      await recordEvolveImportFailure(db, batchId, `${card.card_no}:zh`, 'write', 'DATABASE_WRITE', getErrorMessage(error), { cardNo: card.card_no });
      counters.failedCount += 1;
    }
  }
}

/** Active cards absent from the latest source snapshot soft-deleted. */
export async function softDeleteMissingEvolveCards(db: ShadowverseEvolveLocalDb, seenCardNos: Set<string>) {
  const activeCards = await db.select({ cardNo: EvolveCard.cardNo })
    .from(EvolveCard)
    .where(isNull(EvolveCard.deletedAt));
  const now = new Date();
  let softDeletedCount = 0;

  for (const { cardNo } of activeCards) {
    if (seenCardNos.has(cardNo)) {
      continue;
    }

    await db.update(EvolveCard)
      .set({ deletedAt: now })
      .where(and(eq(EvolveCard.cardNo, cardNo), isNull(EvolveCard.deletedAt)));
    softDeletedCount += 1;
  }

  return softDeletedCount;
}

/** One database import batch row converted into the stable desktop report shape. */
export function buildEvolveImportReport(batch: typeof EvolveImportBatch.$inferSelect): EvolveImportReport {
  return {
    batchId: batch.id,
    source: batch.source,
    sourceUrl: batch.sourceUrl,
    status: batch.status,
    sourceRecordCount: batch.sourceRecordCount,
    addedCount: batch.addedCount,
    updatedCount: batch.updatedCount,
    skippedCount: batch.skippedCount,
    failedCount: batch.failedCount,
    softDeletedCount: batch.softDeletedCount,
    error: batch.error,
    startedAt: batch.startedAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
  };
}

/** Most recent local import batches ordered from newest to oldest. */
export async function listEvolveImportBatches(limit = 20) {
  const rows = await getShadowverseEvolveLocalDb().select()
    .from(EvolveImportBatch)
    .where(eq(EvolveImportBatch.source, evolveJaSource))
    .orderBy(desc(EvolveImportBatch.startedAt))
    .limit(limit);

  return rows.map(buildEvolveImportReport);
}

/** Aggregated counters persisted once all languages finish. */
export async function finalizeEvolveImportBatch(options: {
  db: ShadowverseEvolveLocalDb;
  batchId: string;
  counters: EvolveImportCounters;
  sourceRecordCount: number;
  softDeletedCount: number;
}) {
  const { db, batchId, counters, sourceRecordCount, softDeletedCount } = options;
  const completedAt = new Date();
  const status = counters.failedCount > 0 ? 'completed_with_errors' as const : 'completed' as const;

  await db.insert(EvolveImportState)
    .values({
      source: evolveJaSource,
      sourceUrl: evolveSourceUrl,
      lastSuccessfulBatchId: batchId,
      updatedAt: completedAt,
    })
    .onConflictDoUpdate({
      target: EvolveImportState.source,
      set: {
        sourceUrl: evolveSourceUrl,
        lastSuccessfulBatchId: batchId,
        updatedAt: completedAt,
      },
    });

  const completed = await db.update(EvolveImportBatch)
    .set({
      status,
      sourceRecordCount,
      addedCount: counters.addedCount,
      updatedCount: counters.updatedCount,
      skippedCount: counters.skippedCount,
      failedCount: counters.failedCount,
      softDeletedCount,
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(EvolveImportBatch.id, batchId))
    .returning()
    .then(rows => rows[0]);

  return completed ?? null;
}

/** zh rows fetched in bulk during the enumeration stage and imported between blocks. */
export { downloadJaCardNos, downloadEnCardNos, downloadSveCardList, evolveJaSource, evolveEnSource, evolveZhSource };
