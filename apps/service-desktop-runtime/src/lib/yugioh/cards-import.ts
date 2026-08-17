import {
  and,
  count,
  desc,
  eq,
  isNull,
} from 'drizzle-orm';

import {
  Card,
  CardSource,
  ImportBatch,
  ImportFailure,
  ImportState,
} from '@tcg-cards/db/schema/local/yugioh';

import {
  downloadCardsSource,
  yugiohCardsSource,
  yugiohCardsUrl,
} from './cards-source';
import { getYugiohLocalDb } from './yugioh-local-db';

import type { NormalizedCard, SourceRecordFailure } from './cards-source';

/** Candidate internal IDs found while reconciling one source record. */
export interface CardIdentityCandidates {
  mappedCardId: number | null;
  cidCardId: number | null;
  passwordCardId: number | null;
}

/** Identity resolution result choosing an existing card or a new auto-increment ID. */
export type CardIdentity =
  | { kind: 'existing'; cardId: number }
  | { kind: 'new' };

/** Import batch summary returned to desktop clients. */
export interface YugiohImportReport {
  batchId: string;
  source: string;
  sourceUrl: string;
  archiveHash: string | null;
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

/** Optional progress update emitted during one desktop import. */
export interface YugiohImportProgress {
  phase: string;
  message: string;
  completedCount?: number;
  totalCount?: number;
}

/** Conflict raised when stable source identifiers point at different cards. */
export class CardIdentityConflictError extends Error {
  /** Builds one identity conflict safe for import failure reporting. */
  constructor(message: string) {
    super(message);
    this.name = 'CardIdentityConflictError';
  }
}

/** Whether one mapped card can skip a domain update during an identical import. */
export function shouldSkipCardImport(input: {
  sourceHash: string;
  previousSourceHash: string | null;
  mappingRetired: boolean;
  cardDeleted: boolean;
}) {
  return input.previousSourceHash === input.sourceHash
    && !input.mappingRetired
    && !input.cardDeleted;
}

/** Whether a card must be soft-deleted after its last active source retires. */
export function shouldSoftDeleteCard(activeSourceCount: number) {
  return activeSourceCount === 0;
}

/** Stable identifier candidates resolved without considering any card name. */
export function resolveCardIdentity(candidates: CardIdentityCandidates): CardIdentity {
  const { mappedCardId, cidCardId, passwordCardId } = candidates;

  if (mappedCardId != null) {
    if (cidCardId != null && cidCardId !== mappedCardId) {
      throw new CardIdentityConflictError('cid resolves to a different card than the source mapping.');
    }

    if (passwordCardId != null && passwordCardId !== mappedCardId) {
      throw new CardIdentityConflictError('password resolves to a different card than the source mapping.');
    }

    return { kind: 'existing', cardId: mappedCardId };
  }

  if (cidCardId != null && passwordCardId != null && cidCardId !== passwordCardId) {
    throw new CardIdentityConflictError('cid and password resolve to different cards.');
  }

  const cardId = cidCardId ?? passwordCardId;
  return cardId == null ? { kind: 'new' } : { kind: 'existing', cardId };
}

/** Database column values derived from one normalized source card. */
function cardValues(card: NormalizedCard) {
  return {
    cid: card.cid,
    password: card.password,
    cnName: card.cnName,
    scName: card.scName,
    mdName: card.mdName,
    nwbbsName: card.nwbbsName,
    cnocgName: card.cnocgName,
    jpRuby: card.jpRuby,
    jpName: card.jpName,
    enName: card.enName,
    mdEnName: card.mdEnName,
    wikiEnName: card.wikiEnName,
    setExt: card.setExt,
    typesText: card.typesText,
    pendulumDescription: card.pendulumDescription,
    description: card.description,
    ot: card.ot,
    setcode: card.setcode == null ? null : BigInt(card.setcode),
    type: card.type,
    attack: card.attack,
    defense: card.defense,
    level: card.level,
    race: card.race,
    attribute: card.attribute,
  };
}

/** One database import batch row converted into the stable desktop report shape. */
function buildImportReport(batch: typeof ImportBatch.$inferSelect): YugiohImportReport {
  return {
    batchId: batch.id,
    source: batch.source,
    sourceUrl: batch.sourceUrl,
    archiveHash: batch.archiveHash,
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

/** Unknown thrown value converted into a concise error message. */
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Existing card ID selected by one optional unique external identifier. */
async function findCardId(
  tx: Parameters<Parameters<ReturnType<typeof getYugiohLocalDb>['transaction']>[0]>[0],
  column: typeof Card.cid | typeof Card.password,
  value: number | string | null,
) {
  if (value == null) {
    return null;
  }

  const row = await tx.select({ id: Card.id })
    .from(Card)
    .where(eq(column, value as never))
    .limit(1)
    .then(rows => rows[0]);

  return row?.id ?? null;
}

/** One normalized card applied atomically with its source mapping. */
async function applyCard(
  db: ReturnType<typeof getYugiohLocalDb>,
  batchId: string,
  card: NormalizedCard,
) {
  return await db.transaction(async tx => {
    const mapping = await tx.select()
      .from(CardSource)
      .where(and(
        eq(CardSource.source, yugiohCardsSource),
        eq(CardSource.sourceRecordId, card.sourceRecordId),
      ))
      .limit(1)
      .then(rows => rows[0] ?? null);
    const cidCardId = await findCardId(tx, Card.cid, card.cid);
    const passwordCardId = await findCardId(tx, Card.password, card.password);
    const identity = resolveCardIdentity({
      mappedCardId: mapping?.cardId ?? null,
      cidCardId,
      passwordCardId,
    });
    const now = new Date();

    if (identity.kind === 'new') {
      const inserted = await tx.insert(Card)
        .values(cardValues(card))
        .returning({ id: Card.id })
        .then(rows => rows[0]);

      if (inserted == null) {
        throw new Error('Card insert did not return an internal ID.');
      }

      await tx.insert(CardSource).values({
        source: yugiohCardsSource,
        sourceRecordId: card.sourceRecordId,
        cardId: inserted.id,
        sourceHash: card.sourceHash,
        firstSeenBatchId: batchId,
        lastSeenBatchId: batchId,
      });

      return 'added' as const;
    }

    const existing = await tx.select({ deletedAt: Card.deletedAt })
      .from(Card)
      .where(eq(Card.id, identity.cardId))
      .limit(1)
      .then(rows => rows[0]);

    if (existing == null) {
      throw new Error(`Resolved card ${identity.cardId} does not exist.`);
    }

    const skipped = shouldSkipCardImport({
      sourceHash: card.sourceHash,
      previousSourceHash: mapping?.sourceHash ?? null,
      mappingRetired: mapping?.retiredAt != null,
      cardDeleted: existing.deletedAt != null,
    });

    if (skipped) {
      await tx.update(CardSource)
        .set({ lastSeenBatchId: batchId, updatedAt: now })
        .where(and(
          eq(CardSource.source, yugiohCardsSource),
          eq(CardSource.sourceRecordId, card.sourceRecordId),
        ));

      return 'skipped' as const;
    }

    await tx.update(Card)
      .set({ ...cardValues(card), deletedAt: null, updatedAt: now })
      .where(eq(Card.id, identity.cardId));

    if (mapping == null) {
      await tx.insert(CardSource).values({
        source: yugiohCardsSource,
        sourceRecordId: card.sourceRecordId,
        cardId: identity.cardId,
        sourceHash: card.sourceHash,
        firstSeenBatchId: batchId,
        lastSeenBatchId: batchId,
      });
    } else {
      await tx.update(CardSource)
        .set({
          sourceHash: card.sourceHash,
          lastSeenBatchId: batchId,
          retiredAt: null,
          updatedAt: now,
        })
        .where(and(
          eq(CardSource.source, yugiohCardsSource),
          eq(CardSource.sourceRecordId, card.sourceRecordId),
        ));
    }

    return 'updated' as const;
  });
}

/** One source-record failure inserted or replaced for the current batch. */
async function recordFailure(
  db: ReturnType<typeof getYugiohLocalDb>,
  batchId: string,
  failure: SourceRecordFailure,
) {
  await db.insert(ImportFailure).values({
    batchId,
    sourceRecordId: failure.sourceRecordId,
    stage: failure.stage,
    code: failure.code,
    message: failure.message,
    payload: failure.payload,
  }).onConflictDoUpdate({
    target: [ImportFailure.batchId, ImportFailure.sourceRecordId],
    set: {
      stage: failure.stage,
      code: failure.code,
      message: failure.message,
      payload: failure.payload,
    },
  });
}

/** Missing active source mappings retired without physically deleting domain cards. */
async function softDeleteMissingCards(
  db: ReturnType<typeof getYugiohLocalDb>,
  seenSourceRecordIds: Set<string>,
) {
  const activeMappings = await db.select({
    sourceRecordId: CardSource.sourceRecordId,
    cardId: CardSource.cardId,
  })
    .from(CardSource)
    .where(and(
      eq(CardSource.source, yugiohCardsSource),
      isNull(CardSource.retiredAt),
    ));
  let softDeletedCount = 0;

  for (const mapping of activeMappings) {
    if (seenSourceRecordIds.has(mapping.sourceRecordId)) {
      continue;
    }

    const deleted = await db.transaction(async tx => {
      const now = new Date();

      await tx.update(CardSource)
        .set({ retiredAt: now, updatedAt: now })
        .where(and(
          eq(CardSource.source, yugiohCardsSource),
          eq(CardSource.sourceRecordId, mapping.sourceRecordId),
          isNull(CardSource.retiredAt),
        ));

      const activeSourceCount = await tx.select({ value: count() })
        .from(CardSource)
        .where(and(
          eq(CardSource.cardId, mapping.cardId),
          isNull(CardSource.retiredAt),
        ))
        .then(rows => rows[0]?.value ?? 0);

      if (!shouldSoftDeleteCard(activeSourceCount)) {
        return false;
      }

      const rows = await tx.update(Card)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(Card.id, mapping.cardId), isNull(Card.deletedAt)))
        .returning({ id: Card.id });

      return rows.length > 0;
    });

    if (deleted) {
      softDeletedCount += 1;
    }
  }

  return softDeletedCount;
}

/** Interrupted batches marked before a new desktop import begins. */
async function markInterruptedBatches(db: ReturnType<typeof getYugiohLocalDb>) {
  const now = new Date();

  await db.update(ImportBatch)
    .set({ status: 'interrupted', error: 'Desktop import process ended before completion.', completedAt: now, updatedAt: now })
    .where(eq(ImportBatch.status, 'running'));
}

/** Fixed cards.zip downloaded and idempotently imported into the local build database. */
export async function importYugiohCards(options?: {
  onProgress?: (progress: YugiohImportProgress) => void;
}) {
  const db = getYugiohLocalDb();
  const onProgress = options?.onProgress;

  await markInterruptedBatches(db);

  const batch = await db.insert(ImportBatch)
    .values({ source: yugiohCardsSource, sourceUrl: yugiohCardsUrl })
    .returning()
    .then(rows => rows[0]);

  if (batch == null) {
    throw new Error('Import batch creation did not return a batch ID.');
  }

  try {
    onProgress?.({ phase: 'downloading', message: '正在下载 cards.zip…' });
    const source = await downloadCardsSource();

    await db.update(ImportBatch)
      .set({
        archiveHash: source.archiveHash,
        etag: source.etag,
        lastModified: source.lastModified,
        unknownFields: source.unknownFields,
        sourceRecordCount: source.seenSourceRecordIds.length,
        updatedAt: new Date(),
      })
      .where(eq(ImportBatch.id, batch.id));

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const failure of source.failures) {
      await recordFailure(db, batch.id, failure);
      failedCount += 1;
    }

    onProgress?.({
      phase: 'importing',
      message: '正在导入卡牌…',
      completedCount: 0,
      totalCount: source.cards.length,
    });

    for (let index = 0; index < source.cards.length; index += 1) {
      const card = source.cards[index]!;

      try {
        const action = await applyCard(db, batch.id, card);

        if (action === 'added') addedCount += 1;
        if (action === 'updated') updatedCount += 1;
        if (action === 'skipped') skippedCount += 1;
      } catch (error) {
        await recordFailure(db, batch.id, {
          sourceRecordId: card.sourceRecordId,
          stage: 'write',
          code: error instanceof CardIdentityConflictError ? 'IDENTITY_CONFLICT' : 'DATABASE_WRITE',
          message: getErrorMessage(error),
          payload: { cid: card.cid, password: card.password },
        });
        failedCount += 1;
      }

      if ((index + 1) % 100 === 0 || index + 1 === source.cards.length) {
        onProgress?.({
          phase: 'importing',
          message: '正在导入卡牌…',
          completedCount: index + 1,
          totalCount: source.cards.length,
        });
      }
    }

    onProgress?.({ phase: 'soft_deleting', message: '正在处理来源中消失的卡牌…' });
    const softDeletedCount = await softDeleteMissingCards(
      db,
      new Set(source.seenSourceRecordIds),
    );
    const completedAt = new Date();
    const status = failedCount > 0 ? 'completed_with_errors' as const : 'completed' as const;

    await db.insert(ImportState).values({
      source: yugiohCardsSource,
      sourceUrl: yugiohCardsUrl,
      lastSuccessfulBatchId: batch.id,
      archiveHash: source.archiveHash,
      etag: source.etag,
      lastModified: source.lastModified,
      updatedAt: completedAt,
    }).onConflictDoUpdate({
      target: ImportState.source,
      set: {
        sourceUrl: yugiohCardsUrl,
        lastSuccessfulBatchId: batch.id,
        archiveHash: source.archiveHash,
        etag: source.etag,
        lastModified: source.lastModified,
        updatedAt: completedAt,
      },
    });

    const completed = await db.update(ImportBatch)
      .set({
        status,
        addedCount,
        updatedCount,
        skippedCount,
        failedCount,
        softDeletedCount,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(ImportBatch.id, batch.id))
      .returning()
      .then(rows => rows[0]);

    if (completed == null) {
      throw new Error('Completed import batch could not be reloaded.');
    }

    onProgress?.({ phase: 'completed', message: '卡牌导入完成。', completedCount: source.cards.length, totalCount: source.cards.length });
    return buildImportReport(completed);
  } catch (error) {
    const failedAt = new Date();
    const message = getErrorMessage(error);

    await db.update(ImportBatch)
      .set({ status: 'failed', error: message, completedAt: failedAt, updatedAt: failedAt })
      .where(eq(ImportBatch.id, batch.id));

    throw error;
  }
}

/** Recent local import batches ordered from newest to oldest. */
export async function listYugiohImportBatches(limit = 20) {
  const rows = await getYugiohLocalDb().select()
    .from(ImportBatch)
    .where(eq(ImportBatch.source, yugiohCardsSource))
    .orderBy(desc(ImportBatch.startedAt))
    .limit(limit);

  return rows.map(buildImportReport);
}

/** Most recent local import batch or null before the first import. */
export async function getLatestYugiohImportBatch() {
  return await listYugiohImportBatches(1).then(rows => rows[0] ?? null);
}
