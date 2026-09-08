import { createHash } from 'node:crypto';

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import {
  Card as LocalCard,
  CardLocalization as LocalCardLocalization,
  CardNameVariant as LocalCardNameVariant,
  PublishBaseline,
  PublishBatch,
  PublishBatchRow,
} from '@tcg-cards/db/schema/local/yugioh';
import {
  Card as RemoteCard,
  CardLocalization as RemoteCardLocalization,
  CardNameVariant as RemoteCardNameVariant,
  PublishLedger,
} from '@tcg-cards/db/schema/remote/yugioh';

import { resolveYugiohPublishTarget } from '../runtime/desktop-database';
import { getYugiohLocalDb } from './yugioh-local-db';
import { requireYugiohPublishTarget } from './publish-target';

/** Complete shared-domain card bundle included in local and remote manifests. */
export interface PublishCardRow {
  card: typeof LocalCard.$inferSelect;
  localizations: Array<typeof LocalCardLocalization.$inferSelect>;
  nameVariants: Array<typeof LocalCardNameVariant.$inferSelect>;
}

/** Aggregate row counts retained for one publish plan. */
export interface CardPublishCounts {
  totalRowCount: number;
  changedRowCount: number;
  insertedRowCount: number;
  updatedRowCount: number;
  unchangedRowCount: number;
}

/** One deterministic publish action for a local card row. */
export interface CardPublishPlanRow {
  cardId: number;
  rowHash: string;
  previousRowHash: string | null;
  action: 'insert' | 'update' | 'unchanged';
}

/** Complete deterministic card publication plan. */
export interface CardPublishPlan {
  rows: CardPublishPlanRow[];
  counts: CardPublishCounts;
  manifestHash: string;
}

/** Publish batch summary returned to desktop clients. */
export interface YugiohPublishReport extends CardPublishCounts {
  batchId: string;
  publishTargetId: string;
  environment: string;
  targetFingerprint: string;
  manifestHash: string;
  previousManifestHash: string | null;
  status: 'planning' | 'applying' | 'completed' | 'failed';
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  pendingRowCount?: number;
}

/** Optional progress update emitted during one desktop publication. */
export interface YugiohPublishProgress {
  phase: string;
  message: string;
  completedCount?: number;
  totalCount?: number;
}

/** Remote card identity drift that requires manual target cleanup. */
export class RemoteIdentityDriftError extends Error {
  /** Builds one target drift error without exposing connection details. */
  constructor(message: string) {
    super(message);
    this.name = 'RemoteIdentityDriftError';
  }
}

/** Lowercase SHA-256 digest of one canonical JSON value. */
function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Stable JSON-safe domain fields retained in each card row hash. */
function serializableCard(card: PublishCardRow) {
  return {
    card: {
      ...card.card,
      setcode: card.card.setcode?.toString() ?? null,
      primaryImageDeletedAt: card.card.primaryImageDeletedAt?.toISOString() ?? null,
      createdAt: card.card.createdAt.toISOString(),
      updatedAt: card.card.updatedAt.toISOString(),
      deletedAt: card.card.deletedAt?.toISOString() ?? null,
    },
    localizations: [...card.localizations]
      .sort((left, right) => left.locale.localeCompare(right.locale, 'en'))
      .map(localization => ({
        ...localization,
        createdAt: localization.createdAt.toISOString(),
        updatedAt: localization.updatedAt.toISOString(),
        deletedAt: localization.deletedAt?.toISOString() ?? null,
      })),
    nameVariants: [...card.nameVariants]
      .sort((left, right) => left.kind.localeCompare(right.kind, 'en'))
      .map(variant => ({
        ...variant,
        createdAt: variant.createdAt.toISOString(),
        updatedAt: variant.updatedAt.toISOString(),
        deletedAt: variant.deletedAt?.toISOString() ?? null,
      })),
  };
}

/** Deterministic hash covering every shared-domain field in one card row. */
export function hashCardRow(card: PublishCardRow) {
  return hashJson(serializableCard(card));
}

/** Current card rows compared with the previous completed baseline. */
export function buildCardPublishPlan(
  cards: PublishCardRow[],
  previous: Map<number, string>,
): CardPublishPlan {
  const sorted = [...cards].sort((left, right) => left.card.id - right.card.id);
  const currentIds = new Set(sorted.map(card => card.card.id));

  for (const cardId of previous.keys()) {
    if (!currentIds.has(cardId)) {
      throw new Error(`Local card ${cardId} disappeared instead of being soft-deleted.`);
    }
  }

  const rows = sorted.map(card => {
    const rowHash = hashCardRow(card);
    const previousRowHash = previous.get(card.card.id) ?? null;
    const action = previousRowHash == null
      ? 'insert' as const
      : previousRowHash === rowHash
        ? 'unchanged' as const
        : 'update' as const;

    return {
      cardId: card.card.id,
      rowHash,
      previousRowHash,
      action,
    };
  });
  const insertedRowCount = rows.filter(row => row.action === 'insert').length;
  const updatedRowCount = rows.filter(row => row.action === 'update').length;
  const unchangedRowCount = rows.filter(row => row.action === 'unchanged').length;

  return {
    rows,
    counts: {
      totalRowCount: rows.length,
      changedRowCount: insertedRowCount + updatedRowCount,
      insertedRowCount,
      updatedRowCount,
      unchangedRowCount,
    },
    manifestHash: hashJson(rows.map(row => ({ cardId: row.cardId, rowHash: row.rowHash }))),
  };
}

/** Remote IDs and unique external identifiers checked against local authority. */
export function assertRemoteIdentityCompatible(
  localCards: PublishCardRow[],
  remoteCards: PublishCardRow[],
) {
  const localById = new Map(localCards.map(card => [card.card.id, card]));
  const localByCid = new Map(localCards
    .filter(card => card.card.cid != null)
    .map(card => [card.card.cid!, card.card.id]));
  const localByPassword = new Map(localCards
    .filter(card => card.card.password != null)
    .map(card => [card.card.password!, card.card.id]));

  for (const remote of remoteCards) {
    if (!localById.has(remote.card.id)) {
      throw new RemoteIdentityDriftError(
        `Remote card ${remote.card.id} does not exist in the local authoritative dataset.`,
      );
    }

    if (remote.card.cid != null) {
      const localCardId = localByCid.get(remote.card.cid);

      if (localCardId != null && localCardId !== remote.card.id) {
        throw new RemoteIdentityDriftError(
          `Remote cid ${remote.card.cid} belongs to card ${remote.card.id}, but local assigns it to ${localCardId}.`,
        );
      }
    }

    if (remote.card.password != null) {
      const localCardId = localByPassword.get(remote.card.password);

      if (localCardId != null && localCardId !== remote.card.id) {
        throw new RemoteIdentityDriftError(
          `Remote password ${remote.card.password} belongs to card ${remote.card.id}, but local assigns it to ${localCardId}.`,
        );
      }
    }
  }
}

/** Remote ledger and live card manifest checked against the local publish baseline. */
export function assertRemoteLedgerCompatible(input: {
  expectedManifestHash: string | null;
  targetEnvironment: string;
  targetFingerprint: string;
  remoteManifestHash: string;
  remoteRowCount: number;
  allowIntermediateManifest: boolean;
  ledger: Pick<
    typeof PublishLedger.$inferSelect,
    'environment' | 'targetFingerprint' | 'manifestHash' | 'totalRowCount'
  > | null;
}) {
  if (input.expectedManifestHash == null) {
    if (input.ledger != null || (!input.allowIntermediateManifest && input.remoteRowCount !== 0)) {
      throw new RemoteIdentityDriftError('Remote target contains publication state without a local baseline.');
    }

    return;
  }

  if (input.ledger == null) {
    throw new RemoteIdentityDriftError('Remote publish ledger is missing for the local baseline.');
  }

  if (input.ledger.environment !== input.targetEnvironment
    || input.ledger.targetFingerprint !== input.targetFingerprint) {
    throw new RemoteIdentityDriftError('Remote publish ledger belongs to a different target identity.');
  }

  if (input.ledger.manifestHash !== input.expectedManifestHash) {
    throw new RemoteIdentityDriftError('Remote publish ledger differs from the local baseline.');
  }

  if (!input.allowIntermediateManifest && (input.remoteManifestHash !== input.ledger.manifestHash
    || input.remoteRowCount !== input.ledger.totalRowCount)) {
    throw new RemoteIdentityDriftError('Remote card manifest differs from its last publish ledger.');
  }
}

/** Intermediate remote rows constrained to the baseline or current resumable plan. */
export function assertRemoteRowsRecoverable(
  remoteCards: PublishCardRow[],
  rows: Array<{
    cardId: number;
    previousRowHash: string | null;
    rowHash: string;
    status: string;
  }>,
) {
  const remoteById = new Map(remoteCards.map(card => [card.card.id, card]));

  for (const row of rows) {
    const remote = remoteById.get(row.cardId);

    if (row.status !== 'pending' && row.status !== 'applied' && row.status !== 'skipped') {
      throw new RemoteIdentityDriftError(`Publish row ${row.cardId} has unsupported recovery status ${row.status}.`);
    }

    if (remote == null) {
      if (row.status !== 'pending' || row.previousRowHash != null) {
        throw new RemoteIdentityDriftError(`Remote card ${row.cardId} disappeared during publish recovery.`);
      }

      continue;
    }

    const remoteHash = hashCardRow(remote);

    if (row.status !== 'pending' && remoteHash !== row.rowHash) {
      throw new RemoteIdentityDriftError(
        `Applied remote card ${row.cardId} no longer matches its planned row.`,
      );
    }

    if (row.status === 'pending' && remoteHash !== row.rowHash && remoteHash !== row.previousRowHash) {
      throw new RemoteIdentityDriftError(
        `Remote card ${row.cardId} differs from both the baseline and the planned row.`,
      );
    }
  }
}

/** Pending publish rows selected in stable card-ID order for recovery. */
export function selectResumablePublishRows<T extends { cardId: number; status: string }>(rows: T[]) {
  return rows
    .filter(row => row.status === 'pending')
    .sort((left, right) => left.cardId - right.cardId);
}

/** Failed publish chunk described for batch and per-card recovery diagnostics. */
export function describePublishChunkFailure(cardIds: number[], error: unknown) {
  const rowError = error instanceof Error ? error.message : String(error);
  const ids = [...cardIds].sort((left, right) => left - right).join(', ');

  return {
    batchError: `Cards ${ids} failed: ${rowError}`,
    rowError,
  };
}

/** PostgreSQL identity sequence state derived from preserved remote card IDs. */
export function remoteIdentitySequenceState(cardIds: number[]) {
  return cardIds.length === 0
    ? { value: 1, isCalled: false }
    : { value: Math.max(...cardIds), isCalled: true };
}

/** Final remote manifest and row count required to match the local snapshot. */
export function assertPublishedManifest(
  localManifestHash: string,
  localRowCount: number,
  remoteManifestHash: string,
  remoteRowCount: number,
) {
  if (remoteManifestHash !== localManifestHash) {
    throw new Error(`Remote manifest ${remoteManifestHash} does not match local manifest ${localManifestHash}.`);
  }

  if (remoteRowCount !== localRowCount) {
    throw new Error(`Remote row count ${remoteRowCount} does not match local row count ${localRowCount}.`);
  }
}

/** Publish batch database row converted into the stable desktop report shape. */
function buildPublishReport(batch: typeof PublishBatch.$inferSelect): YugiohPublishReport {
  return {
    batchId: batch.id,
    publishTargetId: batch.publishTargetId,
    environment: batch.environment,
    targetFingerprint: batch.targetFingerprint,
    manifestHash: batch.manifestHash,
    previousManifestHash: batch.previousManifestHash,
    status: batch.status,
    error: batch.error,
    totalRowCount: batch.totalRowCount,
    changedRowCount: batch.changedRowCount,
    insertedRowCount: batch.insertedRowCount,
    updatedRowCount: batch.updatedRowCount,
    unchangedRowCount: batch.unchangedRowCount,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
  };
}

/** Card facts copied from one local bundle while preserving its authoritative ID. */
export function buildRemoteCardValues(card: PublishCardRow) {
  return {
    ...card.card,
  };
}

const remoteConflictValues = {
  cid: sql`excluded.cid`,
  password: sql`excluded.password`,
  ot: sql`excluded.ot`,
  setcode: sql`excluded.setcode`,
  type: sql`excluded.type`,
  attack: sql`excluded.attack`,
  defense: sql`excluded.defense`,
  level: sql`excluded.level`,
  race: sql`excluded.race`,
  attribute: sql`excluded.attribute`,
  primaryImageR2Bucket: sql`excluded.primary_image_r2_bucket`,
  primaryImageR2Key: sql`excluded.primary_image_r2_key`,
  primaryImageContentType: sql`excluded.primary_image_content_type`,
  primaryImageByteSize: sql`excluded.primary_image_byte_size`,
  primaryImageWidth: sql`excluded.primary_image_width`,
  primaryImageHeight: sql`excluded.primary_image_height`,
  primaryImageSha256: sql`excluded.primary_image_sha256`,
  primaryImageDeletedAt: sql`excluded.primary_image_deleted_at`,
  createdAt: sql`excluded.created_at`,
  updatedAt: sql`excluded.updated_at`,
  deletedAt: sql`excluded.deleted_at`,
};

/** Localized rows copied to remote while preserving their composite identity. */
function buildRemoteLocalizationValues(card: PublishCardRow) {
  return card.localizations.map(localization => ({
    cardId: localization.cardId,
    locale: localization.locale,
    name: localization.name,
    nameRuby: localization.nameRuby,
    typesText: localization.typesText,
    pendulumDescription: localization.pendulumDescription,
    description: localization.description,
    createdAt: localization.createdAt,
    updatedAt: localization.updatedAt,
    deletedAt: localization.deletedAt,
  }));
}

/** Searchable name-variant rows copied to remote with their named identity intact. */
function buildRemoteNameVariantValues(card: PublishCardRow) {
  return card.nameVariants.map(variant => ({
    cardId: variant.cardId,
    locale: variant.locale,
    kind: variant.kind,
    name: variant.name,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
    deletedAt: variant.deletedAt,
  }));
}

const remoteLocalizationConflictValues = {
  name: sql`excluded.name`,
  nameRuby: sql`excluded.name_ruby`,
  typesText: sql`excluded.types_text`,
  pendulumDescription: sql`excluded.pendulum_description`,
  description: sql`excluded.description`,
  createdAt: sql`excluded.created_at`,
  updatedAt: sql`excluded.updated_at`,
  deletedAt: sql`excluded.deleted_at`,
};

const remoteNameVariantConflictValues = {
  name: sql`excluded.name`,
  createdAt: sql`excluded.created_at`,
  updatedAt: sql`excluded.updated_at`,
  deletedAt: sql`excluded.deleted_at`,
};

/** Array split into bounded chunks for database writes. */
function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

/** Groups shared card rows and their dependent rows into deterministic publication bundles. */
function buildPublishCards(
  cards: Array<typeof LocalCard.$inferSelect>,
  localizations: Array<typeof LocalCardLocalization.$inferSelect>,
  nameVariants: Array<typeof LocalCardNameVariant.$inferSelect>,
): PublishCardRow[] {
  const localizationsByCardId = new Map<number, Array<typeof LocalCardLocalization.$inferSelect>>();
  const nameVariantsByCardId = new Map<number, Array<typeof LocalCardNameVariant.$inferSelect>>();

  for (const localization of localizations) {
    const values = localizationsByCardId.get(localization.cardId) ?? [];
    values.push(localization);
    localizationsByCardId.set(localization.cardId, values);
  }

  for (const variant of nameVariants) {
    const values = nameVariantsByCardId.get(variant.cardId) ?? [];
    values.push(variant);
    nameVariantsByCardId.set(variant.cardId, values);
  }

  return cards.map(card => ({
    card,
    localizations: localizationsByCardId.get(card.id) ?? [],
    nameVariants: nameVariantsByCardId.get(card.id) ?? [],
  }));
}

/** Complete local card bundles loaded for one deterministic publication snapshot. */
async function loadLocalPublishCards(db: ReturnType<typeof getYugiohLocalDb>) {
  const [cards, localizations, nameVariants] = await Promise.all([
    db.select().from(LocalCard).orderBy(asc(LocalCard.id)),
    db.select().from(LocalCardLocalization).orderBy(asc(LocalCardLocalization.cardId)),
    db.select().from(LocalCardNameVariant).orderBy(asc(LocalCardNameVariant.cardId)),
  ]);

  return buildPublishCards(cards, localizations, nameVariants);
}

/** Complete remote card bundles loaded for publication verification and recovery. */
async function loadRemotePublishCards(db: ReturnType<typeof createDb>) {
  const [cards, localizations, nameVariants] = await Promise.all([
    db.select().from(RemoteCard).orderBy(asc(RemoteCard.id)),
    db.select().from(RemoteCardLocalization).orderBy(asc(RemoteCardLocalization.cardId)),
    db.select().from(RemoteCardNameVariant).orderBy(asc(RemoteCardNameVariant.cardId)),
  ]);

  return buildPublishCards(cards, localizations, nameVariants);
}

/** Previous completed per-card hashes loaded for one publish target. */
async function loadPreviousHashes(
  db: ReturnType<typeof getYugiohLocalDb>,
  publishTargetId: string,
) {
  const baseline = await db.select()
    .from(PublishBaseline)
    .where(eq(PublishBaseline.publishTargetId, publishTargetId))
    .limit(1)
    .then(rows => rows[0] ?? null);

  if (baseline == null) {
    return { baseline, hashes: new Map<number, string>() };
  }

  const rows = await db.select({
    cardId: PublishBatchRow.cardId,
    rowHash: PublishBatchRow.rowHash,
  })
    .from(PublishBatchRow)
    .where(eq(PublishBatchRow.batchId, baseline.batchId));

  return {
    baseline,
    hashes: new Map(rows.map(row => [row.cardId, row.rowHash])),
  };
}

/** One complete local card snapshot planned and persisted before remote writes. */
export async function createYugiohPublishPlan() {
  const target = requireYugiohPublishTarget();
  const db = getYugiohLocalDb();
  const cards = await loadLocalPublishCards(db);
  const { baseline, hashes } = await loadPreviousHashes(db, target.publishTargetId);
  const plan = buildCardPublishPlan(cards, hashes);
  const batch = await db.insert(PublishBatch).values({
    publishTargetId: target.publishTargetId,
    environment: target.environment,
    targetFingerprint: target.targetFingerprint,
    manifestHash: plan.manifestHash,
    previousManifestHash: baseline?.manifestHash ?? null,
    ...plan.counts,
  }).returning().then(rows => rows[0]);

  if (batch == null) {
    throw new Error('Publish batch creation did not return a batch ID.');
  }

  for (const chunk of chunkValues(plan.rows, 500)) {
    await db.insert(PublishBatchRow).values(chunk.map(row => ({
      batchId: batch.id,
      cardId: row.cardId,
      rowHash: row.rowHash,
      previousRowHash: row.previousRowHash,
      action: row.action,
      status: row.action === 'unchanged' ? 'skipped' as const : 'pending' as const,
      appliedAt: row.action === 'unchanged' ? new Date() : null,
    })));
  }

  return buildPublishReport(batch);
}

/** Batch marked failed after a non-resumable planning or target verification error. */
async function failPublishBatch(
  db: ReturnType<typeof getYugiohLocalDb>,
  batchId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);

  await db.update(PublishBatch)
    .set({ status: 'failed', error: message, updatedAt: new Date() })
    .where(eq(PublishBatch.id, batchId));
}

/** Remote identity sequence advanced to the preserved maximum local card ID. */
async function calibrateRemoteIdentity(
  tx: Parameters<Parameters<ReturnType<typeof createDb>['transaction']>[0]>[0],
  cardIds: number[],
) {
  const state = remoteIdentitySequenceState(cardIds);

  await tx.execute(sql`
    select setval(
      pg_get_serial_sequence('yugioh.cards', 'id'),
      ${state.value},
      ${state.isCalled}
    )
  `);
}

/** Planned local rows applied to the verified test remote with resumable chunks. */
export async function executeYugiohPublishBatch(
  batchId: string,
  options?: { onProgress?: (progress: YugiohPublishProgress) => void },
) {
  const target = requireYugiohPublishTarget();
  const localDb = getYugiohLocalDb();
  const batch = await localDb.select()
    .from(PublishBatch)
    .where(eq(PublishBatch.id, batchId))
    .limit(1)
    .then(rows => rows[0]);

  if (batch == null) {
    throw new Error(`Publish batch ${batchId} does not exist.`);
  }

  if (batch.status === 'completed') {
    return buildPublishReport(batch);
  }

  if (batch.publishTargetId !== target.publishTargetId
    || batch.environment !== target.environment
    || batch.targetFingerprint !== target.targetFingerprint) {
    const error = new RemoteIdentityDriftError('Configured publish target no longer matches the planned batch.');
    await failPublishBatch(localDb, batch.id, error);
    throw error;
  }

  const liveTarget = await resolveYugiohPublishTarget({
    publishTargetId: target.publishTargetId,
    environment: target.environment,
    connectionString: target.connectionString,
  });

  if (liveTarget.targetFingerprint !== target.targetFingerprint) {
    const error = new RemoteIdentityDriftError('Live publish target fingerprint differs from the configured binding.');
    await failPublishBatch(localDb, batch.id, error);
    throw error;
  }

  const remoteDb = createDb(target.connectionString);

  try {
    const localCards = await loadLocalPublishCards(localDb);
    const currentManifest = buildCardPublishPlan(localCards, new Map()).manifestHash;

    if (currentManifest !== batch.manifestHash) {
      const error = new Error('Local card data changed after the publish plan was created.');
      await failPublishBatch(localDb, batch.id, error);
      throw error;
    }

    const batchRows = await localDb.select()
      .from(PublishBatchRow)
      .where(eq(PublishBatchRow.batchId, batch.id))
      .orderBy(asc(PublishBatchRow.cardId));

    const remoteCards = await loadRemotePublishCards(remoteDb);
    const remoteLedger = await remoteDb.select()
      .from(PublishLedger)
      .where(eq(PublishLedger.publishTargetId, target.publishTargetId))
      .limit(1)
      .then(rows => rows[0] ?? null);
    const remotePlan = buildCardPublishPlan(remoteCards, new Map());

    try {
      assertRemoteIdentityCompatible(localCards, remoteCards);
      assertRemoteLedgerCompatible({
        expectedManifestHash: batch.previousManifestHash,
        targetEnvironment: target.environment,
        targetFingerprint: target.targetFingerprint,
        remoteManifestHash: remotePlan.manifestHash,
        remoteRowCount: remotePlan.counts.totalRowCount,
        allowIntermediateManifest: batch.status === 'applying',
        ledger: remoteLedger,
      });

      if (batch.status === 'applying') {
        assertRemoteRowsRecoverable(remoteCards, batchRows);
      }
    } catch (error) {
      await failPublishBatch(localDb, batch.id, error);
      throw error;
    }

    await localDb.update(PublishBatch)
      .set({ status: 'applying', startedAt: batch.startedAt ?? new Date(), error: null, updatedAt: new Date() })
      .where(eq(PublishBatch.id, batch.id));

    const pending = selectResumablePublishRows(batchRows);
    const cardsById = new Map(localCards.map(card => [card.card.id, card]));
    const chunks = chunkValues(pending, 500);
    let completedCount = 0;

    options?.onProgress?.({
      phase: 'publishing',
      message: '正在发布卡牌到测试 remote…',
      completedCount,
      totalCount: pending.length,
    });

    for (const chunk of chunks) {
      const cards = chunk.map(row => {
        const card = cardsById.get(row.cardId);

        if (card == null) {
          throw new Error(`Planned local card ${row.cardId} is missing.`);
        }

        return card;
      });

      try {
        await remoteDb.transaction(async tx => {
          const cardIds = cards.map(card => card.card.id);
          const localizations = cards.flatMap(buildRemoteLocalizationValues);
          const nameVariants = cards.flatMap(buildRemoteNameVariantValues);

          await tx.insert(RemoteCard)
            .values(cards.map(buildRemoteCardValues))
            .onConflictDoUpdate({
              target: RemoteCard.id,
              set: remoteConflictValues,
            });

          await tx.update(RemoteCardLocalization)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(inArray(RemoteCardLocalization.cardId, cardIds));
          await tx.update(RemoteCardNameVariant)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(inArray(RemoteCardNameVariant.cardId, cardIds));

          if (localizations.length > 0) {
            await tx.insert(RemoteCardLocalization)
              .values(localizations)
              .onConflictDoUpdate({
                target: [RemoteCardLocalization.cardId, RemoteCardLocalization.locale],
                set: remoteLocalizationConflictValues,
              });
          }

          if (nameVariants.length > 0) {
            await tx.insert(RemoteCardNameVariant)
              .values(nameVariants)
              .onConflictDoUpdate({
                target: [RemoteCardNameVariant.cardId, RemoteCardNameVariant.locale, RemoteCardNameVariant.kind],
                set: remoteNameVariantConflictValues,
              });
          }
        });

        const appliedAt = new Date();

        await localDb.update(PublishBatchRow)
          .set({ status: 'applied', appliedAt, updatedAt: appliedAt, error: null })
          .where(and(
            eq(PublishBatchRow.batchId, batch.id),
            inArray(PublishBatchRow.cardId, chunk.map(row => row.cardId)),
          ));
      } catch (error) {
        const cardIds = chunk.map(row => row.cardId);
        const failure = describePublishChunkFailure(cardIds, error);

        await localDb.update(PublishBatchRow)
          .set({ error: failure.rowError, updatedAt: new Date() })
          .where(and(
            eq(PublishBatchRow.batchId, batch.id),
            inArray(PublishBatchRow.cardId, cardIds),
          ));

        await localDb.update(PublishBatch)
          .set({ error: failure.batchError, updatedAt: new Date() })
          .where(eq(PublishBatch.id, batch.id));
        throw error;
      }

      completedCount += chunk.length;
      options?.onProgress?.({
        phase: 'publishing',
        message: '正在发布卡牌到测试 remote…',
        completedCount,
        totalCount: pending.length,
      });
    }

    const finalRemoteCards = await loadRemotePublishCards(remoteDb);
    const remoteManifest = buildCardPublishPlan(finalRemoteCards, new Map()).manifestHash;

    assertPublishedManifest(
      batch.manifestHash,
      batch.totalRowCount,
      remoteManifest,
      finalRemoteCards.length,
    );

    const publishedAt = new Date();

    await remoteDb.transaction(async tx => {
      await calibrateRemoteIdentity(tx, finalRemoteCards.map(card => card.card.id));
      await tx.insert(PublishLedger).values({
        publishTargetId: target.publishTargetId,
        environment: target.environment,
        targetFingerprint: target.targetFingerprint,
        batchId: batch.id,
        manifestHash: batch.manifestHash,
        totalRowCount: batch.totalRowCount,
        changedRowCount: batch.changedRowCount,
        publishedAt,
      }).onConflictDoUpdate({
        target: PublishLedger.publishTargetId,
        set: {
          environment: target.environment,
          targetFingerprint: target.targetFingerprint,
          batchId: batch.id,
          manifestHash: batch.manifestHash,
          totalRowCount: batch.totalRowCount,
          changedRowCount: batch.changedRowCount,
          publishedAt,
          updatedAt: publishedAt,
        },
      });
    });

    await localDb.insert(PublishBaseline).values({
      publishTargetId: target.publishTargetId,
      environment: target.environment,
      targetFingerprint: target.targetFingerprint,
      batchId: batch.id,
      manifestHash: batch.manifestHash,
      totalRowCount: batch.totalRowCount,
      publishedAt,
    }).onConflictDoUpdate({
      target: PublishBaseline.publishTargetId,
      set: {
        environment: target.environment,
        targetFingerprint: target.targetFingerprint,
        batchId: batch.id,
        manifestHash: batch.manifestHash,
        totalRowCount: batch.totalRowCount,
        publishedAt,
        updatedAt: publishedAt,
      },
    });

    const completed = await localDb.update(PublishBatch)
      .set({ status: 'completed', error: null, completedAt: publishedAt, updatedAt: publishedAt })
      .where(eq(PublishBatch.id, batch.id))
      .returning()
      .then(rows => rows[0]);

    if (completed == null) {
      throw new Error('Completed publish batch could not be reloaded.');
    }

    options?.onProgress?.({ phase: 'completed', message: '测试 remote 发布完成。' });
    return buildPublishReport(completed);
  } finally {
    await remoteDb.$client.end({ timeout: 1 });
  }
}

/** Existing incomplete batch resumed before any new publish plan is created. */
export async function publishYugiohCards(options?: {
  onProgress?: (progress: YugiohPublishProgress) => void;
}) {
  const incomplete = await getIncompleteYugiohPublishBatch();

  if (incomplete != null) {
    return await executeYugiohPublishBatch(incomplete.batchId, options);
  }

  const plan = await createYugiohPublishPlan();
  return await executeYugiohPublishBatch(plan.batchId, options);
}

/** Recent local publish batches for the currently configured test target. */
export async function listYugiohPublishBatches(limit = 20) {
  const target = requireYugiohPublishTarget();
  const rows = await getYugiohLocalDb().select()
    .from(PublishBatch)
    .where(eq(PublishBatch.publishTargetId, target.publishTargetId))
    .orderBy(desc(PublishBatch.createdAt))
    .limit(limit);

  return rows.map(buildPublishReport);
}

/** Oldest resumable planning or applying batch for the configured target. */
export async function getIncompleteYugiohPublishBatch() {
  const target = requireYugiohPublishTarget();
  const batch = await getYugiohLocalDb().select()
    .from(PublishBatch)
    .where(and(
      eq(PublishBatch.publishTargetId, target.publishTargetId),
      sql`${PublishBatch.status} in ('planning', 'applying')`,
    ))
    .orderBy(asc(PublishBatch.createdAt))
    .limit(1)
    .then(rows => rows[0] ?? null);

  if (batch == null) {
    return null;
  }

  const pendingRowCount = await getYugiohLocalDb().select({ value: sql<number>`count(*)::int` })
    .from(PublishBatchRow)
    .where(and(
      eq(PublishBatchRow.batchId, batch.id),
      eq(PublishBatchRow.status, 'pending'),
    ))
    .then(rows => rows[0]?.value ?? 0);

  return { ...buildPublishReport(batch), pendingRowCount };
}
