import { createHash, randomUUID } from 'node:crypto';

import { and, asc, eq, inArray } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import {
  Card as LocalCard,
  Entity as LocalEntity,
  EntityLocalization as LocalEntityLocalization,
  EntityRelation as LocalEntityRelation,
  PublishBaseline,
  PublishBatch,
  PublishBatchCard,
  SourceVersion,
} from '@tcg-cards/db/schema/local/hearthstone';
import {
  Card as RemoteCard,
  Entity as RemoteEntity,
  EntityLocalization as RemoteEntityLocalization,
  EntityRelation as RemoteEntityRelation,
  PublishLedger,
} from '@tcg-cards/db/schema/remote/hearthstone';

import { getLocalDb } from './hsdata-local-db';
import { requireHearthstonePublishTarget } from './hsdata-publish-target';

/** Drizzle database client used by the Bun publish workflow. */
type PublishDb = ReturnType<typeof createDb>;

/** Drizzle transaction client used by local and remote publish writes. */
type PublishDbTx = Parameters<Parameters<PublishDb['transaction']>[0]>[0];

/** One latest local card family prepared for publish hashing and remote apply. */
interface PublishCardSnapshot {
  cardId: string;
  card: typeof LocalCard.$inferSelect;
  entities: (typeof LocalEntity.$inferSelect)[];
  localizations: (typeof LocalEntityLocalization.$inferSelect)[];
  relations: (typeof LocalEntityRelation.$inferSelect)[];
  entityFamilyHash: string;
  localizationFamilyHash: string;
  relationFamilyHash: string;
  manifestHash: string;
}

/** One per-card manifest row persisted in publish batch state. */
export interface PublishCardManifestState {
  cardId: string;
  entityFamilyHash: string;
  localizationFamilyHash: string;
  relationFamilyHash: string;
  manifestHash: string;
  entityRowCount: number;
  localizationRowCount: number;
  relationRowCount: number;
}

/** One card-level diff row derived from the current projection and previous baseline. */
interface PublishBatchCardPlan {
  cardId: string;
  action: typeof PublishBatchCard.$inferSelect['action'];
  current: PublishCardManifestState;
  previousManifestHash: string | null;
}

/** Source-tag and build range derived from the current latest projected entities. */
interface PublishDatasetRange {
  sourceTagMin: number;
  sourceTagMax: number;
  buildMin: number;
  buildMax: number;
}

/** Aggregate card counts persisted on publish batch and ledger rows. */
interface PublishBatchCounts {
  cardCount: number;
  changedCardCount: number;
  insertedCardCount: number;
  updatedCardCount: number;
  deletedCardCount: number;
  unchangedCardCount: number;
}

/** Publish result returned to the desktop frontend after one remote apply attempt. */
export interface HsdataPublishReport {
  batchId: string;
  publishTargetId: string;
  environment: string;
  targetFingerprint: string;
  manifestHash: string;
  previousManifestHash: string | null;
  sourceTagMin: number;
  sourceTagMax: number;
  buildMin: number;
  buildMax: number;
  cardCount: number;
  changedCardCount: number;
  insertedCardCount: number;
  updatedCardCount: number;
  deletedCardCount: number;
  unchangedCardCount: number;
  publishedAt: string;
}

/** Failed remote apply state annotated with the card that caused the rollback when known. */
interface PublishApplyFailure {
  cardId: string | null;
  message: string;
}

/** Stable empty-family hash reused by deleted-card manifest rows. */
const emptyHash = sha256Hex(Buffer.from('[]'));

/** Stable write batch size used for `publish_batch_cards` inserts. */
const writeBatchSize = 500;

/** Stable lowercase SHA-256 digest for one byte slice. */
function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Stable SHA-256 digest for one JSON-serializable value. */
function hashJson(value: unknown): string {
  return sha256Hex(Buffer.from(JSON.stringify(value)));
}

/** Short human-readable message normalized from one unknown thrown value. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Fixed-size chunks used by batched insert helpers. */
function chunkValues<T>(values: T[], size = writeBatchSize): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

/** Stable manifest projection for one entity row. */
function entityManifestValue(row: typeof LocalEntity.$inferSelect) {
  return {
    cardId: row.cardId,
    version: row.version,
    revisionHash: row.revisionHash,
    dbfId: row.dbfId,
    legacyPayload: row.legacyPayload,
    set: row.set,
    classes: row.classes,
    type: row.type,
    cost: row.cost,
    attack: row.attack,
    health: row.health,
    durability: row.durability,
    armor: row.armor,
    rune: row.rune,
    race: row.race,
    spellSchool: row.spellSchool,
    questType: row.questType,
    questProgress: row.questProgress,
    questPart: row.questPart,
    heroPower: row.heroPower,
    techLevel: row.techLevel,
    inBobsTavern: row.inBobsTavern,
    tripleCard: row.tripleCard,
    raceBucket: row.raceBucket,
    armorBucket: row.armorBucket,
    buddy: row.buddy,
    bannedRace: row.bannedRace,
    mercenaryRole: row.mercenaryRole,
    mercenaryFaction: row.mercenaryFaction,
    colddown: row.colddown,
    collectible: row.collectible,
    elite: row.elite,
    rarity: row.rarity,
    artist: row.artist,
    overrideWatermark: row.overrideWatermark,
    faction: row.faction,
    mechanics: row.mechanics,
    referencedTags: row.referencedTags,
    textBuilderType: row.textBuilderType,
    changeType: row.changeType,
    isLatest: row.isLatest,
  };
}

/** Stable manifest projection for one localization row. */
function localizationManifestValue(row: typeof LocalEntityLocalization.$inferSelect) {
  return {
    cardId: row.cardId,
    version: row.version,
    lang: row.lang,
    revisionHash: row.revisionHash,
    localizationHash: row.localizationHash,
    renderHash: row.renderHash,
    renderModel: row.renderModel,
    isLatest: row.isLatest,
    name: row.name,
    text: row.text,
    richText: row.richText,
    displayText: row.displayText,
    targetText: row.targetText,
    textInPlay: row.textInPlay,
    howToEarn: row.howToEarn,
    howToEarnGolden: row.howToEarnGolden,
    flavorText: row.flavorText,
    locChangeType: row.locChangeType,
  };
}

/** Stable manifest projection for one relation row. */
function relationManifestValue(row: typeof LocalEntityRelation.$inferSelect) {
  return {
    sourceId: row.sourceId,
    sourceRevisionHash: row.sourceRevisionHash,
    relation: row.relation,
    targetId: row.targetId,
    version: row.version,
    isLatest: row.isLatest,
  };
}

/** Stable manifest projection for one card row. */
function cardManifestValue(row: typeof LocalCard.$inferSelect) {
  return {
    cardId: row.cardId,
    legalities: row.legalities,
  };
}

/** Current per-card manifest reconstructed from one latest local card family. */
function buildCurrentCardManifest(snapshot: PublishCardSnapshot): PublishCardManifestState {
  return {
    cardId: snapshot.cardId,
    entityFamilyHash: snapshot.entityFamilyHash,
    localizationFamilyHash: snapshot.localizationFamilyHash,
    relationFamilyHash: snapshot.relationFamilyHash,
    manifestHash: snapshot.manifestHash,
    entityRowCount: snapshot.entities.length,
    localizationRowCount: snapshot.localizations.length,
    relationRowCount: snapshot.relations.length,
  };
}

/** Card-level publish diff and aggregate counts derived from current and previous manifest rows. */
function buildPublishBatchPlanFromCurrentManifests(
  currentRows: PublishCardManifestState[],
  previous: Map<string, PublishCardManifestState>,
): {
    plans: PublishBatchCardPlan[];
    counts: PublishBatchCounts;
    manifestHash: string;
  } {
  const current = new Map<string, PublishCardManifestState>(
    currentRows.map(row => [row.cardId, row]),
  );
  const cardIds = [...new Set([
    ...current.keys(),
    ...previous.keys(),
  ])].sort();
  const counts: PublishBatchCounts = {
    cardCount: cardIds.length,
    changedCardCount: 0,
    insertedCardCount: 0,
    updatedCardCount: 0,
    deletedCardCount: 0,
    unchangedCardCount: 0,
  };
  const plans: PublishBatchCardPlan[] = [];

  for (const cardId of cardIds) {
    const currentRow = current.get(cardId);
    const previousRow = previous.get(cardId);

    if (currentRow != null && previousRow == null) {
      counts.changedCardCount += 1;
      counts.insertedCardCount += 1;
      plans.push({
        cardId,
        action: 'insert',
        current: currentRow,
        previousManifestHash: null,
      });
      continue;
    }

    if (currentRow != null && previousRow != null && currentRow.manifestHash === previousRow.manifestHash) {
      counts.unchangedCardCount += 1;
      plans.push({
        cardId,
        action: 'unchanged',
        current: currentRow,
        previousManifestHash: previousRow.manifestHash,
      });
      continue;
    }

    if (currentRow != null && previousRow != null) {
      counts.changedCardCount += 1;
      counts.updatedCardCount += 1;
      plans.push({
        cardId,
        action: 'update',
        current: currentRow,
        previousManifestHash: previousRow.manifestHash,
      });
      continue;
    }

    if (currentRow == null && previousRow != null) {
      counts.changedCardCount += 1;
      counts.deletedCardCount += 1;
      plans.push({
        cardId,
        action: 'delete',
        current: buildDeletedCardManifest(previousRow),
        previousManifestHash: previousRow.manifestHash,
      });
    }
  }

  return {
    plans,
    counts,
    manifestHash: hashJson(plans
      .filter(plan => plan.action !== 'delete')
      .map(plan => ({
        cardId: plan.cardId,
        entityFamilyHash: plan.current.entityFamilyHash,
        localizationFamilyHash: plan.current.localizationFamilyHash,
        relationFamilyHash: plan.current.relationFamilyHash,
        manifestHash: plan.current.manifestHash,
      }))),
  };
}

/** Deleted-card manifest synthesized from the previous successful baseline row. */
function buildDeletedCardManifest(previous: PublishCardManifestState): PublishCardManifestState {
  return {
    cardId: previous.cardId,
    entityFamilyHash: emptyHash,
    localizationFamilyHash: emptyHash,
    relationFamilyHash: emptyHash,
    manifestHash: hashJson({
      entityFamilyHash: emptyHash,
      localizationFamilyHash: emptyHash,
      relationFamilyHash: emptyHash,
    }),
    entityRowCount: 0,
    localizationRowCount: 0,
    relationRowCount: 0,
  };
}

/** Latest local card families loaded from the shared Hearthstone projection tables. */
async function loadCurrentPublishSnapshots(db: PublishDb): Promise<PublishCardSnapshot[]> {
  const entityRows = await db.select()
    .from(LocalEntity)
    .where(eq(LocalEntity.isLatest, true))
    .orderBy(
      asc(LocalEntity.cardId),
      asc(LocalEntity.revisionHash),
    );
  const localizationRows = await db.select()
    .from(LocalEntityLocalization)
    .where(eq(LocalEntityLocalization.isLatest, true))
    .orderBy(
      asc(LocalEntityLocalization.cardId),
      asc(LocalEntityLocalization.lang),
      asc(LocalEntityLocalization.revisionHash),
      asc(LocalEntityLocalization.localizationHash),
    );
  const relationRows = await db.select()
    .from(LocalEntityRelation)
    .where(eq(LocalEntityRelation.isLatest, true))
    .orderBy(
      asc(LocalEntityRelation.sourceId),
      asc(LocalEntityRelation.relation),
      asc(LocalEntityRelation.targetId),
      asc(LocalEntityRelation.sourceRevisionHash),
    );

  const entityMap = new Map<string, (typeof LocalEntity.$inferSelect)[]>();
  const localizationMap = new Map<string, (typeof LocalEntityLocalization.$inferSelect)[]>();
  const relationMap = new Map<string, (typeof LocalEntityRelation.$inferSelect)[]>();
  const cardIds = new Set<string>();

  for (const row of entityRows) {
    cardIds.add(row.cardId);
    entityMap.set(row.cardId, [...(entityMap.get(row.cardId) ?? []), row]);
  }

  for (const row of localizationRows) {
    cardIds.add(row.cardId);
    localizationMap.set(row.cardId, [...(localizationMap.get(row.cardId) ?? []), row]);
  }

  for (const row of relationRows) {
    cardIds.add(row.sourceId);
    relationMap.set(row.sourceId, [...(relationMap.get(row.sourceId) ?? []), row]);
  }

  const sortedCardIds = [...cardIds].sort();

  if (sortedCardIds.length === 0) {
    return [];
  }

  const cardRows = await db.select()
    .from(LocalCard)
    .where(inArray(LocalCard.cardId, sortedCardIds))
    .orderBy(asc(LocalCard.cardId));
  const cardMap = new Map(cardRows.map(row => [row.cardId, row]));
  const snapshots: PublishCardSnapshot[] = [];

  for (const cardId of sortedCardIds) {
    const card = cardMap.get(cardId) ?? {
      cardId,
      legalities: {},
    } satisfies typeof LocalCard.$inferSelect;
    const entities = entityMap.get(cardId) ?? [];
    const localizations = localizationMap.get(cardId) ?? [];
    const relations = relationMap.get(cardId) ?? [];

    if (entities.length === 0) {
      throw new Error(`Local publish snapshot for card ${cardId} is missing latest entity rows.`);
    }

    const entityFamilyHash = hashJson(entities.map(entityManifestValue));
    const localizationFamilyHash = hashJson(localizations.map(localizationManifestValue));
    const relationFamilyHash = hashJson(relations.map(relationManifestValue));
    const manifestHash = hashJson({
      card: cardManifestValue(card),
      entityFamilyHash,
      localizationFamilyHash,
      relationFamilyHash,
    });

    snapshots.push({
      cardId,
      card,
      entities,
      localizations,
      relations,
      entityFamilyHash,
      localizationFamilyHash,
      relationFamilyHash,
      manifestHash,
    });
  }

  return snapshots;
}

/** Previous successful per-card manifests loaded from the current local publish baseline. */
async function loadPreviousPublishManifests(
  db: PublishDb,
  publishTargetId: string,
): Promise<{
    baseline: typeof PublishBaseline.$inferSelect | null;
    manifests: Map<string, PublishCardManifestState>;
  }> {
  const baseline = await db.select()
    .from(PublishBaseline)
    .where(eq(PublishBaseline.publishTargetId, publishTargetId))
    .then(rows => rows[0] ?? null);

  if (baseline == null) {
    return {
      baseline: null,
      manifests: new Map(),
    };
  }

  const rows = await db.select()
    .from(PublishBatchCard)
    .where(eq(PublishBatchCard.batchId, baseline.batchId));
  const manifests = new Map<string, PublishCardManifestState>();

  for (const row of rows) {
    if (row.action === 'delete') {
      continue;
    }

    manifests.set(row.cardId, {
      cardId: row.cardId,
      entityFamilyHash: row.entityFamilyHash,
      localizationFamilyHash: row.localizationFamilyHash,
      relationFamilyHash: row.relationFamilyHash,
      manifestHash: row.manifestHash,
      entityRowCount: row.entityRowCount,
      localizationRowCount: row.localizationRowCount,
      relationRowCount: row.relationRowCount,
    });
  }

  return {
    baseline,
    manifests,
  };
}

/** Source-tag and build range mapped from the current latest local entity versions. */
async function derivePublishDatasetRange(
  db: PublishDb,
  snapshots: PublishCardSnapshot[],
): Promise<PublishDatasetRange> {
  const builds = [...new Set(snapshots.flatMap(snapshot => snapshot.entities.flatMap(row => row.version)))].sort((left, right) => left - right);

  if (builds.length === 0) {
    throw new Error('Local publish snapshot does not include any Hearthstone build numbers.');
  }

  const sourceVersionRows = await db.select({
    sourceTag: SourceVersion.sourceTag,
    build: SourceVersion.build,
  })
    .from(SourceVersion)
    .where(and(
      inArray(SourceVersion.build, builds),
      eq(SourceVersion.status, 'completed'),
      eq(SourceVersion.projectionStatus, 'completed'),
    ));
  const sourceTags = [...new Set(
    sourceVersionRows
      .filter(row => row.build != null)
      .map(row => row.sourceTag),
  )].sort((left, right) => left - right);

  if (sourceTags.length === 0) {
    throw new Error('Local publish snapshot could not resolve source tags for the current build set.');
  }

  return {
    sourceTagMin: sourceTags[0]!,
    sourceTagMax: sourceTags[sourceTags.length - 1]!,
    buildMin: builds[0]!,
    buildMax: builds[builds.length - 1]!,
  };
}

/** Card-level publish diff and aggregate counts derived from the previous baseline. */
function buildPublishBatchPlan(
  snapshots: PublishCardSnapshot[],
  previous: Map<string, PublishCardManifestState>,
): {
    plans: PublishBatchCardPlan[];
    counts: PublishBatchCounts;
    manifestHash: string;
  } {
  return buildPublishBatchPlanFromCurrentManifests(
    snapshots.map(buildCurrentCardManifest),
    previous,
  );
}

/** Draft publish batch row inserted before remote apply begins. */
async function insertPublishBatch(
  db: PublishDb,
  input: {
    batchId: string;
    publishTargetId: string;
    environment: string;
    targetFingerprint: string;
    range: PublishDatasetRange;
    manifestHash: string;
    previousManifestHash: string | null;
    counts: PublishBatchCounts;
  },
): Promise<void> {
  const now = new Date();

  await db.insert(PublishBatch).values({
    id: input.batchId,
    publishTargetId: input.publishTargetId,
    environment: input.environment,
    targetFingerprint: input.targetFingerprint,
    sourceTagMin: input.range.sourceTagMin,
    sourceTagMax: input.range.sourceTagMax,
    buildMin: input.range.buildMin,
    buildMax: input.range.buildMax,
    manifestHash: input.manifestHash,
    previousManifestHash: input.previousManifestHash,
    cardCount: input.counts.cardCount,
    changedCardCount: input.counts.changedCardCount,
    insertedCardCount: input.counts.insertedCardCount,
    updatedCardCount: input.counts.updatedCardCount,
    deletedCardCount: input.counts.deletedCardCount,
    unchangedCardCount: input.counts.unchangedCardCount,
    status: 'draft',
    error: null,
    summary: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  });
}

/** Per-card publish rows inserted before the remote transaction starts. */
async function insertPublishBatchCards(
  db: PublishDb,
  batchId: string,
  plans: PublishBatchCardPlan[],
): Promise<void> {
  const now = new Date();
  const rows = plans.map(plan => ({
    batchId,
    cardId: plan.cardId,
    entityFamilyHash: plan.current.entityFamilyHash,
    localizationFamilyHash: plan.current.localizationFamilyHash,
    relationFamilyHash: plan.current.relationFamilyHash,
    manifestHash: plan.current.manifestHash,
    previousManifestHash: plan.previousManifestHash,
    action: plan.action,
    status: 'pending' as const,
    error: null,
    entityRowCount: plan.current.entityRowCount,
    localizationRowCount: plan.current.localizationRowCount,
    relationRowCount: plan.current.relationRowCount,
    createdAt: now,
    updatedAt: now,
    appliedAt: null,
  }));

  for (const chunk of chunkValues(rows)) {
    if (chunk.length === 0) {
      continue;
    }

    await db.insert(PublishBatchCard).values(chunk);
  }
}

/** Publish batch status moved to applying before the remote transaction starts. */
async function markPublishBatchApplying(
  db: PublishDb,
  batchId: string,
): Promise<void> {
  const now = new Date();

  await db.update(PublishBatch)
    .set({
      status: 'applying',
      startedAt: now,
      error: null,
      summary: null,
      updatedAt: now,
    })
    .where(eq(PublishBatch.id, batchId));
}

/** Successful batch, batch-card, and baseline state persisted after remote commit. */
async function finalizePublishBatchSuccess(
  db: PublishDb,
  input: {
    batchId: string;
    publishTargetId: string;
    environment: string;
    targetFingerprint: string;
    range: PublishDatasetRange;
    counts: PublishBatchCounts;
    manifestHash: string;
    plans: PublishBatchCardPlan[];
    publishedAt: Date;
  },
): Promise<void> {
  const summary = {
    batchId: input.batchId,
    publishTargetId: input.publishTargetId,
    environment: input.environment,
    cardCount: input.counts.cardCount,
    changedCardCount: input.counts.changedCardCount,
    insertedCardCount: input.counts.insertedCardCount,
    updatedCardCount: input.counts.updatedCardCount,
    deletedCardCount: input.counts.deletedCardCount,
    unchangedCardCount: input.counts.unchangedCardCount,
    publishedAt: input.publishedAt.toISOString(),
  };

  for (const plan of input.plans) {
    await db.update(PublishBatchCard)
      .set({
        status: plan.action === 'unchanged' ? 'skipped' : 'applied',
        error: null,
        appliedAt: input.publishedAt,
        updatedAt: input.publishedAt,
      })
      .where(and(
        eq(PublishBatchCard.batchId, input.batchId),
        eq(PublishBatchCard.cardId, plan.cardId),
      ));
  }

  await db.update(PublishBatch)
    .set({
      status: 'completed',
      error: null,
      summary,
      completedAt: input.publishedAt,
      updatedAt: input.publishedAt,
    })
    .where(eq(PublishBatch.id, input.batchId));

  await db.insert(PublishBaseline).values({
    publishTargetId: input.publishTargetId,
    environment: input.environment,
    targetFingerprint: input.targetFingerprint,
    batchId: input.batchId,
    sourceTagMin: input.range.sourceTagMin,
    sourceTagMax: input.range.sourceTagMax,
    buildMin: input.range.buildMin,
    buildMax: input.range.buildMax,
    manifestHash: input.manifestHash,
    cardCount: input.counts.cardCount,
    publishedAt: input.publishedAt,
    createdAt: input.publishedAt,
    updatedAt: input.publishedAt,
  })
    .onConflictDoUpdate({
      target: PublishBaseline.publishTargetId,
      set: {
        environment: input.environment,
        targetFingerprint: input.targetFingerprint,
        batchId: input.batchId,
        sourceTagMin: input.range.sourceTagMin,
        sourceTagMax: input.range.sourceTagMax,
        buildMin: input.range.buildMin,
        buildMax: input.range.buildMax,
        manifestHash: input.manifestHash,
        cardCount: input.counts.cardCount,
        publishedAt: input.publishedAt,
        updatedAt: input.publishedAt,
      },
    });
}

/** Failed batch state persisted after the remote apply aborts. */
async function finalizePublishBatchFailure(
  db: PublishDb,
  batchId: string,
  failedCardId: string | null,
  error: string,
): Promise<void> {
  const now = new Date();

  if (failedCardId != null) {
    await db.update(PublishBatchCard)
      .set({
        status: 'failed',
        error,
        updatedAt: now,
      })
      .where(and(
        eq(PublishBatchCard.batchId, batchId),
        eq(PublishBatchCard.cardId, failedCardId),
      ));
  }

  await db.update(PublishBatch)
    .set({
      status: 'failed',
      error,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(PublishBatch.id, batchId));
}

/** Publish ledger upsert executed inside the remote publish transaction. */
async function upsertRemotePublishLedger(
  tx: PublishDbTx,
  input: {
    batchId: string;
    publishTargetId: string;
    environment: string;
    targetFingerprint: string;
    range: PublishDatasetRange;
    counts: PublishBatchCounts;
    manifestHash: string;
    publishedAt: Date;
  },
): Promise<void> {
  await tx.insert(PublishLedger).values({
    publishTargetId: input.publishTargetId,
    environment: input.environment,
    targetFingerprint: input.targetFingerprint,
    batchId: input.batchId,
    sourceTagMin: input.range.sourceTagMin,
    sourceTagMax: input.range.sourceTagMax,
    buildMin: input.range.buildMin,
    buildMax: input.range.buildMax,
    manifestHash: input.manifestHash,
    cardCount: input.counts.cardCount,
    changedCardCount: input.counts.changedCardCount,
    publishedAt: input.publishedAt,
    createdAt: input.publishedAt,
    updatedAt: input.publishedAt,
  })
    .onConflictDoUpdate({
      target: PublishLedger.publishTargetId,
      set: {
        environment: input.environment,
        targetFingerprint: input.targetFingerprint,
        batchId: input.batchId,
        sourceTagMin: input.range.sourceTagMin,
        sourceTagMax: input.range.sourceTagMax,
        buildMin: input.range.buildMin,
        buildMax: input.range.buildMax,
        manifestHash: input.manifestHash,
        cardCount: input.counts.cardCount,
        changedCardCount: input.counts.changedCardCount,
        publishedAt: input.publishedAt,
        updatedAt: input.publishedAt,
      },
    });
}

/** Remote row family deleted for one card before re-inserting the current projection. */
async function deleteRemoteCardFamily(
  tx: PublishDbTx,
  cardId: string,
): Promise<void> {
  await tx.delete(RemoteEntityLocalization).where(eq(RemoteEntityLocalization.cardId, cardId));
  await tx.delete(RemoteEntityRelation).where(eq(RemoteEntityRelation.sourceId, cardId));
  await tx.delete(RemoteEntity).where(eq(RemoteEntity.cardId, cardId));
}

/** Remote card row inserted only when the current card id does not exist yet. */
async function ensureRemoteCardRow(
  tx: PublishDbTx,
  row: typeof LocalCard.$inferSelect,
): Promise<void> {
  await tx.insert(RemoteCard).values({
    cardId: row.cardId,
    legalities: row.legalities,
  })
    .onConflictDoNothing();
}

/** Remote row family inserted for one current local card snapshot. */
async function insertRemoteCardFamily(
  tx: PublishDbTx,
  snapshot: PublishCardSnapshot,
): Promise<void> {
  await ensureRemoteCardRow(tx, snapshot.card);

  if (snapshot.entities.length > 0) {
    await tx.insert(RemoteEntity).values(snapshot.entities.map(row => ({
      ...row,
    })));
  }

  if (snapshot.localizations.length > 0) {
    await tx.insert(RemoteEntityLocalization).values(snapshot.localizations.map(row => ({
      ...row,
    })));
  }

  if (snapshot.relations.length > 0) {
    await tx.insert(RemoteEntityRelation).values(snapshot.relations.map(row => ({
      ...row,
    })));
  }
}

/** Structured remote-apply failure normalized from an unknown thrown value. */
function normalizePublishApplyFailure(error: unknown): PublishApplyFailure {
  if (typeof error === 'object' && error != null && 'message' in error && typeof error.message === 'string') {
    const cardId = 'cardId' in error && typeof error.cardId === 'string'
      ? error.cardId
      : null;

    return {
      cardId,
      message: error.message,
    };
  }

  return {
    cardId: null,
    message: getErrorMessage(error),
  };
}

/** Remote transaction that applies one publish batch to the configured target database. */
async function applyPublishBatchToRemote(
  remoteDb: PublishDb,
  input: {
    snapshots: PublishCardSnapshot[];
    plans: PublishBatchCardPlan[];
    batchId: string;
    publishTargetId: string;
    environment: string;
    targetFingerprint: string;
    range: PublishDatasetRange;
    counts: PublishBatchCounts;
    manifestHash: string;
    publishedAt: Date;
  },
): Promise<void> {
  const snapshotMap = new Map(input.snapshots.map(snapshot => [snapshot.cardId, snapshot]));

  try {
    await remoteDb.transaction(async tx => {
      for (const plan of input.plans) {
        try {
          if (plan.action === 'insert' || plan.action === 'update') {
            await deleteRemoteCardFamily(tx, plan.cardId);

            const snapshot = snapshotMap.get(plan.cardId);

            if (snapshot == null) {
              throw new Error(`Current publish snapshot for card ${plan.cardId} is missing during remote apply.`);
            }

            await insertRemoteCardFamily(tx, snapshot);
            continue;
          }

          if (plan.action === 'delete') {
            await deleteRemoteCardFamily(tx, plan.cardId);
          }
        } catch (error) {
          throw {
            cardId: plan.cardId,
            message: getErrorMessage(error),
          } satisfies PublishApplyFailure;
        }
      }

      try {
        await upsertRemotePublishLedger(tx, {
          batchId: input.batchId,
          publishTargetId: input.publishTargetId,
          environment: input.environment,
          targetFingerprint: input.targetFingerprint,
          range: input.range,
          counts: input.counts,
          manifestHash: input.manifestHash,
          publishedAt: input.publishedAt,
        });
      } catch (error) {
        throw {
          cardId: null,
          message: `Failed to update remote publish ledger: ${getErrorMessage(error)}`,
        } satisfies PublishApplyFailure;
      }
    });
  } catch (error) {
    throw normalizePublishApplyFailure(error);
  }
}

/** Current local latest projection published to the configured remote Hearthstone target. */
export async function publishCurrentHsdataToRemote(): Promise<HsdataPublishReport> {
  const target = requireHearthstonePublishTarget();
  const localDb = getLocalDb();
  const remoteDb = createDb(target.connectionString);
  const snapshots = await loadCurrentPublishSnapshots(localDb);

  if (snapshots.length === 0) {
    throw new Error('No latest local Hearthstone projection rows are available for publish.');
  }

  const range = await derivePublishDatasetRange(localDb, snapshots);
  const previous = await loadPreviousPublishManifests(localDb, target.publishTargetId);
  const previousManifestHash = previous.baseline?.manifestHash ?? null;
  const { plans, counts, manifestHash } = buildPublishBatchPlan(snapshots, previous.manifests);
  const batchId = randomUUID();
  const publishedAt = new Date();

  await insertPublishBatch(localDb, {
    batchId,
    publishTargetId: target.publishTargetId,
    environment: target.environment,
    targetFingerprint: target.targetFingerprint,
    range,
    manifestHash,
    previousManifestHash,
    counts,
  });
  await insertPublishBatchCards(localDb, batchId, plans);
  await markPublishBatchApplying(localDb, batchId);

  try {
    await applyPublishBatchToRemote(remoteDb, {
      snapshots,
      plans,
      batchId,
      publishTargetId: target.publishTargetId,
      environment: target.environment,
      targetFingerprint: target.targetFingerprint,
      range,
      counts,
      manifestHash,
      publishedAt,
    });
  } catch (error) {
    const failure = normalizePublishApplyFailure(error);

    await finalizePublishBatchFailure(localDb, batchId, failure.cardId, failure.message);
    throw new Error(failure.message);
  }

  await finalizePublishBatchSuccess(localDb, {
    batchId,
    publishTargetId: target.publishTargetId,
    environment: target.environment,
    targetFingerprint: target.targetFingerprint,
    range,
    counts,
    manifestHash,
    plans,
    publishedAt,
  });

  return {
    batchId,
    publishTargetId: target.publishTargetId,
    environment: target.environment,
    targetFingerprint: target.targetFingerprint,
    manifestHash,
    previousManifestHash,
    sourceTagMin: range.sourceTagMin,
    sourceTagMax: range.sourceTagMax,
    buildMin: range.buildMin,
    buildMax: range.buildMax,
    cardCount: counts.cardCount,
    changedCardCount: counts.changedCardCount,
    insertedCardCount: counts.insertedCardCount,
    updatedCardCount: counts.updatedCardCount,
    deletedCardCount: counts.deletedCardCount,
    unchangedCardCount: counts.unchangedCardCount,
    publishedAt: publishedAt.toISOString(),
  };
}

/** Test-only publish helpers that lock the migrated Rust diff semantics in place. */
export const hsdataPublishTestUtils = {
  emptyHash,
  buildDeletedCardManifest,
  buildPublishBatchPlanFromCurrentManifests,
};
