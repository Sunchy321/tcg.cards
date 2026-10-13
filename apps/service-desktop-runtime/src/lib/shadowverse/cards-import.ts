import { and, desc, eq, isNull } from 'drizzle-orm';

import {
  Card,
  CardEvolution,
  CardEvolutionLocalization,
  CardLocalization,
  CardRelation,
  CardSet,
  CardSetLocalization,
  CardStyle,
  CardStyleLocalization,
  ImportBatch,
  ImportFailure,
  ImportState,
} from '@tcg-cards/db/schema/local/shadowverse';

import {
  downloadLangSnapshot,
  shadowverseCardsSource,
  shadowverseCardsUrl,
} from './cards-source';
import { getShadowverseLocalDb } from './shadowverse-local-db';

import type { ShadowverseLocalDb } from './shadowverse-local-db';
import type { NormalizedCardData, NormalizedLangSnapshot } from './cards-source';
import type { ShadowverseLang } from '#model/shadowverse/schema/data/card-list';

/** Optional progress update emitted during one desktop import. */
export interface ShadowverseImportProgress {
  phase: string;
  message: string;
  completedCount?: number;
  totalCount?: number;
}

/** Import batch summary returned to desktop clients. */
export interface ShadowverseImportReport {
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
export interface ImportCounters {
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

/** Column values derived from the language-independent card payload. */
function cardValues(common: NormalizedCardData['common']) {
  return {
    cardId: common.card_id,
    baseCardId: common.base_card_id,
    cardResourceId: common.card_resource_id,
    originalCardId: common.original_card_id,
    cardSetId: common.card_set_id,
    type: common.type,
    class: common.class,
    rarity: common.rarity,
    cost: common.cost,
    atk: common.atk,
    life: common.life,
    tribes: common.tribes,
    isToken: common.is_token,
    isIncludeRotation: common.is_include_rotation,
    deckEnabledNum: common.deck_enabled_num,
    isStarterAbilityChanged: common.is_starter_ability_changed,
  };
}

/** Localized column values derived from one language's card payload. */
function localizationValues(common: NormalizedCardData['common']) {
  return {
    name: common.name,
    nameRuby: common.name_ruby,
    skillText: common.skill_text,
    flavourText: common.flavour_text,
    cv: common.cv,
    illustrator: common.illustrator,
    questions: common.questions,
    cardImageHash: common.card_image_hash,
    cardBannerImageHash: common.card_banner_image_hash,
  };
}

/** Unknown thrown value converted into a concise error message. */
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Whether the stored core card row already matches the source payload exactly. */
function coreCardUnchanged(existing: typeof Card.$inferSelect, values: ReturnType<typeof cardValues>) {
  return existing.baseCardId === values.baseCardId
    && existing.cardResourceId === values.cardResourceId
    && existing.originalCardId === values.originalCardId
    && existing.cardSetId === values.cardSetId
    && existing.type === values.type
    && existing.class === values.class
    && existing.rarity === values.rarity
    && existing.cost === values.cost
    && existing.atk === values.atk
    && existing.life === values.life
    && JSON.stringify(existing.tribes ?? []) === JSON.stringify(values.tribes ?? [])
    && existing.isToken === values.isToken
    && existing.isIncludeRotation === values.isIncludeRotation
    && existing.deckEnabledNum === values.deckEnabledNum
    && existing.isStarterAbilityChanged === values.isStarterAbilityChanged
    && existing.deletedAt == null;
}

/** Interrupted batches marked before a new desktop import begins. */
export async function markInterruptedImportBatches(db: ShadowverseLocalDb) {
  const now = new Date();

  await db.update(ImportBatch)
    .set({ status: 'interrupted', error: 'Desktop import process ended before completion.', completedAt: now, updatedAt: now })
    .where(eq(ImportBatch.status, 'running'));
}

/** One failure inserted or replaced for the current batch. */
export async function recordImportFailure(
  db: ShadowverseLocalDb,
  batchId: string,
  sourceRecordId: string,
  stage: 'validation' | 'write',
  code: string,
  message: string,
  payload: Record<string, unknown> | null = null,
) {
  await db.insert(ImportFailure).values({
    batchId,
    sourceRecordId,
    stage,
    code,
    message,
    payload,
  }).onConflictDoUpdate({
    target: [ImportFailure.batchId, ImportFailure.sourceRecordId],
    set: { stage, code, message, payload },
  });
}

/** Card pack rows and their localizations upserted for one language snapshot. */
async function importCardSets(
  db: ShadowverseLocalDb,
  batchId: string,
  snapshot: NormalizedLangSnapshot,
) {
  for (const [setId, name] of Object.entries(snapshot.cardSetNames).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const cardSetId = Number(setId);

    if (!Number.isSafeInteger(cardSetId) || cardSetId <= 0) {
      await recordImportFailure(db, batchId, `set:${setId}:${snapshot.lang}`, 'validation', 'INVALID_SET_ID', `Card set id ${setId} is not a positive integer.`);
      continue;
    }

    await db.insert(CardSet)
      .values({ cardSetId })
      .onConflictDoUpdate({
        target: CardSet.cardSetId,
        set: { deletedAt: null },
      });

    await db.insert(CardSetLocalization)
      .values({ cardSetId, lang: snapshot.lang, name })
      .onConflictDoUpdate({
        target: [CardSetLocalization.cardSetId, CardSetLocalization.lang],
        set: { name },
      });
  }

  // Cards may reference sets the official card_set_names map does not name
  // (e.g. the token set), so referenced set rows are ensured before card writes.
  const referencedSetIds = [...new Set(snapshot.cards.map(card => card.common.card_set_id).filter(id => id != null))].sort((a, b) => a - b);

  for (const cardSetId of referencedSetIds) {
    await db.insert(CardSet)
      .values({ cardSetId })
      .onConflictDoUpdate({
        target: CardSet.cardSetId,
        set: { deletedAt: null },
      });
  }
}

/** One card's language-independent core row inserted or updated; reports the action taken. */
async function applyCoreCard(
  db: ShadowverseLocalDb,
  card: NormalizedCardData,
): Promise<'added' | 'updated' | 'skipped'> {
  const values = cardValues(card.common);
  const existing = await db.select()
    .from(Card)
    .where(eq(Card.cardId, card.cardId))
    .limit(1)
    .then(rows => rows[0] ?? null);

  if (existing == null) {
    await db.insert(Card).values(values);
    return 'added';
  }

  if (coreCardUnchanged(existing, values)) {
    return 'skipped';
  }

  await db.update(Card)
    .set({ ...values, deletedAt: null })
    .where(eq(Card.cardId, card.cardId));

  return 'updated';
}

/** One card's localization for one language upserted. */
async function applyCardLocalization(
  db: ShadowverseLocalDb,
  lang: ShadowverseLang,
  card: NormalizedCardData,
) {
  await db.insert(CardLocalization)
    .values({ cardId: card.cardId, lang, ...localizationValues(card.common) })
    .onConflictDoUpdate({
      target: [CardLocalization.cardId, CardLocalization.lang],
      set: localizationValues(card.common),
    });
}

/** One card's evolution row and per-language localization upserted when present. */
async function applyCardEvolution(
  db: ShadowverseLocalDb,
  batchId: string,
  lang: ShadowverseLang,
  card: NormalizedCardData,
) {
  const evo = card.evo;

  if (evo == null) {
    return;
  }

  const values = {
    cardResourceId: evo.card_resource_id,
  };

  await db.insert(CardEvolution)
    .values({ cardId: card.cardId, ...values })
    .onConflictDoUpdate({
      target: CardEvolution.cardId,
      set: values,
    });

  const evoLocalization = {
    skillText: evo.skill_text,
    flavourText: evo.flavour_text,
    cardImageHash: evo.card_image_hash,
    cardBannerImageHash: evo.card_banner_image_hash,
  };

  await db.insert(CardEvolutionLocalization)
    .values({ cardId: card.cardId, lang, ...evoLocalization })
    .onConflictDoUpdate({
      target: [CardEvolutionLocalization.cardId, CardEvolutionLocalization.lang],
      set: evoLocalization,
    })
    .catch(async error => {
      await recordImportFailure(db, batchId, `${card.cardId}:evo:${lang}`, 'write', 'DATABASE_WRITE', getErrorMessage(error), { cardId: card.cardId });
    });
}

/** Style rows created from the core pass; per-language localizations upserted on every pass. */
async function applyCardStyles(
  db: ShadowverseLocalDb,
  batchId: string,
  lang: ShadowverseLang,
  card: NormalizedCardData,
  isCorePass: boolean,
) {
  const styles = card.styles;

  if (isCorePass) {
    for (let styleIndex = 0; styleIndex < styles.length; styleIndex += 1) {
      await db.insert(CardStyle)
        .values({ cardId: card.cardId, styleIndex })
        .onConflictDoNothing();
    }
  }

  for (let styleIndex = 0; styleIndex < styles.length; styleIndex += 1) {
    const style = styles[styleIndex]!;
    const values = {
      name: style.name,
      nameRuby: style.name_ruby,
      cv: style.cv,
      illustrator: style.illustrator,
      skillText: style.skill_text,
      flavourText: style.flavour_text,
      evoFlavourText: style.evo_flavour_text,
      cardImageHash: style.hash,
      evoCardImageHash: style.evo_hash,
    };

    try {
      await db.insert(CardStyleLocalization)
        .values({ cardId: card.cardId, styleIndex, lang, ...values })
        .onConflictDoUpdate({
          target: [CardStyleLocalization.cardId, CardStyleLocalization.styleIndex, CardStyleLocalization.lang],
          set: values,
        });
    } catch (error) {
      await recordImportFailure(db, batchId, `${card.cardId}:style${styleIndex}:${lang}`, 'write', 'DATABASE_WRITE', getErrorMessage(error), { cardId: card.cardId, styleIndex });
    }
  }
}

/** Related-card references materialized on the core pass, filtered to known cards. */
async function applyCardRelations(
  db: ShadowverseLocalDb,
  batchId: string,
  lang: ShadowverseLang,
  snapshot: NormalizedLangSnapshot,
  writtenCardIds: Set<number>,
) {
  for (const [key, relation] of Object.entries(snapshot.relations)) {
    const cardId = Number(key);

    if (!writtenCardIds.has(cardId)) {
      continue;
    }

    try {
      await db.insert(CardRelation)
        .values({
          cardId,
          relatedCardIds: relation.related_card_ids,
          specificEffectCardIds: relation.specific_effect_card_ids,
        })
        .onConflictDoUpdate({
          target: CardRelation.cardId,
          set: {
            relatedCardIds: relation.related_card_ids,
            specificEffectCardIds: relation.specific_effect_card_ids,
          },
        });
    } catch (error) {
      await recordImportFailure(db, batchId, `${cardId}:relations:${lang}`, 'write', 'DATABASE_WRITE', getErrorMessage(error), { cardId });
    }
  }
}

/** One language snapshot imported into the local build database. */
export async function importLangSnapshot(options: {
  db: ShadowverseLocalDb;
  batchId: string;
  snapshot: NormalizedLangSnapshot;
  isCorePass: boolean;
  onProgress?: (progress: ShadowverseImportProgress) => void;
}): Promise<ImportCounters> {
  const { db, batchId, snapshot, isCorePass, onProgress } = options;
  const counters: ImportCounters = { addedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 };
  const writtenCoreCardIds = new Set<number>();

  await importCardSets(db, batchId, snapshot);

  for (let index = 0; index < snapshot.cards.length; index += 1) {
    const card = snapshot.cards[index]!;

    try {
      if (isCorePass) {
        const action = await applyCoreCard(db, card);
        if (action === 'added') counters.addedCount += 1;
        if (action === 'updated') counters.updatedCount += 1;
        if (action === 'skipped') counters.skippedCount += 1;
        // All outcomes leave the card row present, so relations may reference it.
        writtenCoreCardIds.add(card.cardId);
      }

      await applyCardLocalization(db, snapshot.lang, card);
      await applyCardEvolution(db, batchId, snapshot.lang, card);
      await applyCardStyles(db, batchId, snapshot.lang, card, isCorePass);
    } catch (error) {
      await recordImportFailure(db, batchId, `${card.cardId}:${snapshot.lang}`, 'write', 'DATABASE_WRITE', getErrorMessage(error), { cardId: card.cardId });
      counters.failedCount += 1;
    }

    if ((index + 1) % 100 === 0 || index + 1 === snapshot.cards.length) {
      onProgress?.({
        phase: 'importing',
        message: `正在导入 ${snapshot.lang} 卡牌…`,
        completedCount: index + 1,
        totalCount: snapshot.cards.length,
      });
    }
  }

  if (isCorePass) {
    await applyCardRelations(db, batchId, snapshot.lang, snapshot, writtenCoreCardIds);
  }

  return counters;
}

/** Active cards absent from the latest source snapshot soft-deleted. */
export async function softDeleteMissingCards(db: ShadowverseLocalDb, seenCardIds: Set<number>) {
  const activeCards = await db.select({ cardId: Card.cardId })
    .from(Card)
    .where(isNull(Card.deletedAt));
  const now = new Date();
  let softDeletedCount = 0;

  for (const { cardId } of activeCards) {
    if (seenCardIds.has(cardId)) {
      continue;
    }

    await db.update(Card)
      .set({ deletedAt: now })
      .where(and(eq(Card.cardId, cardId), isNull(Card.deletedAt)));
    softDeletedCount += 1;
  }

  return softDeletedCount;
}

/** One database import batch row converted into the stable desktop report shape. */
export function buildImportReport(batch: typeof ImportBatch.$inferSelect): ShadowverseImportReport {
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
export async function listShadowverseImportBatches(limit = 20) {
  const rows = await getShadowverseLocalDb().select()
    .from(ImportBatch)
    .where(eq(ImportBatch.source, shadowverseCardsSource))
    .orderBy(desc(ImportBatch.startedAt))
    .limit(limit);

  return rows.map(buildImportReport);
}

/** Aggregated counters and unknown fields persisted after all languages finish. */
export async function finalizeImportBatch(options: {
  db: ShadowverseLocalDb;
  batchId: string;
  counters: ImportCounters;
  sourceRecordCount: number;
  unknownFields: string[];
  softDeletedCount: number;
}) {
  const { db, batchId, counters, sourceRecordCount, unknownFields, softDeletedCount } = options;
  const completedAt = new Date();
  const status = counters.failedCount > 0 ? 'completed_with_errors' as const : 'completed' as const;

  await db.insert(ImportState)
    .values({
      source: shadowverseCardsSource,
      sourceUrl: shadowverseCardsUrl,
      lastSuccessfulBatchId: batchId,
      updatedAt: completedAt,
    })
    .onConflictDoUpdate({
      target: ImportState.source,
      set: {
        sourceUrl: shadowverseCardsUrl,
        lastSuccessfulBatchId: batchId,
        updatedAt: completedAt,
      },
    });

  const completed = await db.update(ImportBatch)
    .set({
      status,
      sourceRecordCount,
      addedCount: counters.addedCount,
      updatedCount: counters.updatedCount,
      skippedCount: counters.skippedCount,
      failedCount: counters.failedCount,
      softDeletedCount,
      unknownFields,
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(ImportBatch.id, batchId))
    .returning()
    .then(rows => rows[0]);

  return completed ?? null;
}
