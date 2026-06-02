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
  PublishBatchRow,
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

type PublishDb = ReturnType<typeof createDb>;

type PublishDbTx = Parameters<Parameters<PublishDb['transaction']>[0]>[0];

type TableName = 'cards' | 'entities' | 'entity_localizations' | 'entity_relations';

interface PublishRowState {
  tableName: TableName;
  rowPk: string;
  rowHash: string;
}

interface CurrentRowData {
  cards: Map<string, typeof LocalCard.$inferSelect>;
  entities: Map<string, typeof LocalEntity.$inferSelect>;
  localizations: Map<string, typeof LocalEntityLocalization.$inferSelect>;
  relations: Map<string, typeof LocalEntityRelation.$inferSelect>;
}

interface PublishBatchRowPlan {
  tableName: TableName;
  rowPk: string;
  rowHash: string;
  previousRowHash: string | null;
  action: typeof PublishBatchRow.$inferSelect['action'];
}

interface PublishDatasetRange {
  sourceTagMin: number;
  sourceTagMax: number;
  buildMin: number;
  buildMax: number;
}

interface PublishBatchCounts {
  totalRowCount: number;
  changedRowCount: number;
  insertedRowCount: number;
  updatedRowCount: number;
  deletedRowCount: number;
  unchangedRowCount: number;
  cardRowCount: number;
  entityRowCount: number;
  localizationRowCount: number;
  relationRowCount: number;
}

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
  totalRowCount: number;
  changedRowCount: number;
  insertedRowCount: number;
  updatedRowCount: number;
  deletedRowCount: number;
  unchangedRowCount: number;
  cardRowCount: number;
  entityRowCount: number;
  localizationRowCount: number;
  relationRowCount: number;
  publishedAt: string;
}

interface PublishApplyFailure {
  tableName: TableName | null;
  rowPk: string | null;
  message: string;
}

const emptyHash = sha256Hex(Buffer.from('[]'));

const writeBatchSize = 500;

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function closePublishDb(db: PublishDb) {
  await db.$client.end({ timeout: 1 });
}

function hashJson(value: unknown): string {
  return sha256Hex(Buffer.from(JSON.stringify(value)));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function chunkValues<T>(values: T[], size = writeBatchSize): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

/** Build a deterministic JSON string from a PK record with alphabetically sorted keys. */
function serializeRowPk(pk: Record<string, string>): string {
  const sorted: Record<string, string> = {};

  for (const key of Object.keys(pk).sort()) {
    sorted[key] = pk[key];
  }

  return JSON.stringify(sorted);
}

/** Parse a serialized row PK back into a record. */
function parseRowPk(serialized: string): Record<string, string> {
  return JSON.parse(serialized) as Record<string, string>;
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

function cardsRowPk(row: typeof LocalCard.$inferSelect): string {
  return serializeRowPk({ cardId: row.cardId });
}

function entitiesRowPk(row: typeof LocalEntity.$inferSelect): string {
  return serializeRowPk({
    cardId: row.cardId,
    revisionHash: row.revisionHash,
  });
}

function localizationsRowPk(row: typeof LocalEntityLocalization.$inferSelect): string {
  return serializeRowPk({
    cardId: row.cardId,
    lang: row.lang,
    localizationHash: row.localizationHash,
    revisionHash: row.revisionHash,
  });
}

function relationsRowPk(row: typeof LocalEntityRelation.$inferSelect): string {
  return serializeRowPk({
    relation: row.relation,
    sourceId: row.sourceId,
    sourceRevisionHash: row.sourceRevisionHash,
    targetId: row.targetId,
  });
}

function entityRowHash(row: typeof LocalEntity.$inferSelect): string {
  return hashJson(entityManifestValue(row));
}

function localizationRowHash(row: typeof LocalEntityLocalization.$inferSelect): string {
  return hashJson(localizationManifestValue(row));
}

function relationRowHash(row: typeof LocalEntityRelation.$inferSelect): string {
  return hashJson(relationManifestValue(row));
}

function cardRowHash(row: typeof LocalCard.$inferSelect): string {
  return hashJson(cardManifestValue(row));
}

/** Latest local rows loaded from all four publish tables and indexed by PK. */
async function loadCurrentRowSnapshots(db: PublishDb): Promise<{
  states: PublishRowState[];
  data: CurrentRowData;
}> {
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

  const cardIds = new Set<string>();

  for (const row of entityRows) {
    cardIds.add(row.cardId);
  }

  if (cardIds.size === 0) {
    return { states: [], data: { cards: new Map(), entities: new Map(), localizations: new Map(), relations: new Map() } };
  }

  const sortedCardIds = [...cardIds].sort();
  const cardRows = await db.select()
    .from(LocalCard)
    .where(inArray(LocalCard.cardId, sortedCardIds))
    .orderBy(asc(LocalCard.cardId));
  const cardRowMap = new Map(cardRows.map(row => [row.cardId, row]));

  const data: CurrentRowData = {
    cards: new Map(),
    entities: new Map(),
    localizations: new Map(),
    relations: new Map(),
  };
  const states: PublishRowState[] = [];

  for (const row of entityRows) {
    const pk = entitiesRowPk(row);

    data.entities.set(pk, row);
    states.push({ tableName: 'entities', rowPk: pk, rowHash: entityRowHash(row) });
  }

  for (const row of localizationRows) {
    const pk = localizationsRowPk(row);

    data.localizations.set(pk, row);
    states.push({ tableName: 'entity_localizations', rowPk: pk, rowHash: localizationRowHash(row) });
  }

  for (const row of relationRows) {
    const pk = relationsRowPk(row);

    data.relations.set(pk, row);
    states.push({ tableName: 'entity_relations', rowPk: pk, rowHash: relationRowHash(row) });
  }

  for (const cardId of sortedCardIds) {
    const card = cardRowMap.get(cardId) ?? {
      cardId,
      legalities: {},
    } satisfies typeof LocalCard.$inferSelect;
    const pk = cardsRowPk(card);

    data.cards.set(pk, card);
    states.push({ tableName: 'cards', rowPk: pk, rowHash: cardRowHash(card) });
  }

  return { states, data };
}

/** Previous successful per-row hashes loaded from the current local publish baseline. */
async function loadPreviousRowStates(
  db: PublishDb,
  publishTargetId: string,
): Promise<{
    baseline: typeof PublishBaseline.$inferSelect | null;
    previous: Map<TableName, Map<string, string>>;
  }> {
  const baseline = await db.select()
    .from(PublishBaseline)
    .where(eq(PublishBaseline.publishTargetId, publishTargetId))
    .then(rows => rows[0] ?? null);

  const previous = new Map<TableName, Map<string, string>>();

  if (baseline == null) {
    return { baseline: null, previous };
  }

  const rows = await db.select()
    .from(PublishBatchRow)
    .where(eq(PublishBatchRow.batchId, baseline.batchId));

  for (const row of rows) {
    if (row.action === 'delete') {
      continue;
    }

    const tableName = row.tableName as TableName;

    if (!previous.has(tableName)) {
      previous.set(tableName, new Map());
    }

    previous.get(tableName)!.set(row.rowPk, row.rowHash);
  }

  return { baseline, previous };
}

/** Source-tag and build range mapped from the current latest local entity versions. */
async function derivePublishDatasetRange(
  db: PublishDb,
  entityRows: (typeof LocalEntity.$inferSelect)[],
): Promise<PublishDatasetRange> {
  const builds = [...new Set(entityRows.flatMap(row => row.version))].sort((left, right) => left - right);

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

/** Row-level publish diff and aggregate counts derived from current and previous row states. */
function buildRowPlans(
  currentStates: PublishRowState[],
  previous: Map<TableName, Map<string, string>>,
): {
    plans: PublishBatchRowPlan[];
    counts: PublishBatchCounts;
    manifestHash: string;
  } {
  const currentByTable = new Map<TableName, Map<string, string>>();

  for (const state of currentStates) {
    if (!currentByTable.has(state.tableName)) {
      currentByTable.set(state.tableName, new Map());
    }

    currentByTable.get(state.tableName)!.set(state.rowPk, state.rowHash);
  }

  const allTables = new Set<TableName>([...currentByTable.keys(), ...previous.keys()]);
  const plans: PublishBatchRowPlan[] = [];
  const counts: PublishBatchCounts = {
    totalRowCount: 0,
    changedRowCount: 0,
    insertedRowCount: 0,
    updatedRowCount: 0,
    deletedRowCount: 0,
    unchangedRowCount: 0,
    cardRowCount: 0,
    entityRowCount: 0,
    localizationRowCount: 0,
    relationRowCount: 0,
  };

  for (const tableName of allTables) {
    const current = currentByTable.get(tableName) ?? new Map();
    const prev = previous.get(tableName) ?? new Map();
    const allPks = new Set([...current.keys(), ...prev.keys()]);

    for (const rowPk of allPks) {
      const curHash = current.get(rowPk) ?? null;
      const prevHash = prev.get(rowPk) ?? null;

      if (curHash != null && prevHash == null) {
        counts.insertedRowCount += 1;
        counts.changedRowCount += 1;
        plans.push({ tableName, rowPk, rowHash: curHash, previousRowHash: null, action: 'insert' });
      } else if (curHash != null && prevHash != null && curHash === prevHash) {
        counts.unchangedRowCount += 1;
        plans.push({ tableName, rowPk, rowHash: curHash, previousRowHash: prevHash, action: 'unchanged' });
      } else if (curHash != null && prevHash != null) {
        counts.updatedRowCount += 1;
        counts.changedRowCount += 1;
        plans.push({ tableName, rowPk, rowHash: curHash, previousRowHash: prevHash, action: 'update' });
      } else if (curHash == null && prevHash != null) {
        counts.deletedRowCount += 1;
        counts.changedRowCount += 1;
        plans.push({ tableName, rowPk, rowHash: '', previousRowHash: prevHash, action: 'delete' });
      }

      switch (tableName) {
        case 'cards': counts.cardRowCount += 1; break;
        case 'entities': counts.entityRowCount += 1; break;
        case 'entity_localizations': counts.localizationRowCount += 1; break;
        case 'entity_relations': counts.relationRowCount += 1; break;
      }
    }
  }

  counts.totalRowCount = plans.length;

  plans.sort((a, b) => {
    const cmp = a.tableName.localeCompare(b.tableName);

    return cmp !== 0 ? cmp : a.rowPk.localeCompare(b.rowPk);
  });

  const manifestHash = hashJson(plans
    .filter(p => p.action !== 'delete')
    .map(p => ({
      tableName: p.tableName,
      rowPk: p.rowPk,
      rowHash: p.rowHash,
    })));

  return { plans, counts, manifestHash };
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
    totalRowCount: input.counts.totalRowCount,
    changedRowCount: input.counts.changedRowCount,
    insertedRowCount: input.counts.insertedRowCount,
    updatedRowCount: input.counts.updatedRowCount,
    deletedRowCount: input.counts.deletedRowCount,
    unchangedRowCount: input.counts.unchangedRowCount,
    cardRowCount: input.counts.cardRowCount,
    entityRowCount: input.counts.entityRowCount,
    localizationRowCount: input.counts.localizationRowCount,
    relationRowCount: input.counts.relationRowCount,
    status: 'draft',
    error: null,
    summary: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  });
}

/** Per-row publish batch rows inserted before the remote transaction starts. */
async function insertPublishBatchRows(
  db: PublishDb,
  batchId: string,
  plans: PublishBatchRowPlan[],
): Promise<void> {
  const now = new Date();
  const rows = plans.map(plan => ({
    batchId,
    tableName: plan.tableName,
    rowPk: plan.rowPk,
    rowHash: plan.rowHash,
    previousRowHash: plan.previousRowHash,
    action: plan.action,
    status: 'pending' as const,
    error: null,
    createdAt: now,
    updatedAt: now,
    appliedAt: null,
  }));

  for (const chunk of chunkValues(rows)) {
    if (chunk.length === 0) {
      continue;
    }

    await db.insert(PublishBatchRow).values(chunk);
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

/** Successful batch, batch-row, and baseline state persisted after remote commit. */
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
    plans: PublishBatchRowPlan[];
    publishedAt: Date;
  },
): Promise<void> {
  const summary = {
    batchId: input.batchId,
    publishTargetId: input.publishTargetId,
    environment: input.environment,
    totalRowCount: input.counts.totalRowCount,
    changedRowCount: input.counts.changedRowCount,
    insertedRowCount: input.counts.insertedRowCount,
    updatedRowCount: input.counts.updatedRowCount,
    deletedRowCount: input.counts.deletedRowCount,
    unchangedRowCount: input.counts.unchangedRowCount,
    cardRowCount: input.counts.cardRowCount,
    entityRowCount: input.counts.entityRowCount,
    localizationRowCount: input.counts.localizationRowCount,
    relationRowCount: input.counts.relationRowCount,
    publishedAt: input.publishedAt.toISOString(),
  };

  for (const plan of input.plans) {
    await db.update(PublishBatchRow)
      .set({
        status: plan.action === 'unchanged' ? 'skipped' : 'applied',
        error: null,
        appliedAt: input.publishedAt,
        updatedAt: input.publishedAt,
      })
      .where(and(
        eq(PublishBatchRow.batchId, input.batchId),
        eq(PublishBatchRow.tableName, plan.tableName),
        eq(PublishBatchRow.rowPk, plan.rowPk),
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
    totalRowCount: input.counts.totalRowCount,
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
        totalRowCount: input.counts.totalRowCount,
        publishedAt: input.publishedAt,
        updatedAt: input.publishedAt,
      },
    });
}

/** Failed batch state persisted after the remote apply aborts. */
async function finalizePublishBatchFailure(
  db: PublishDb,
  batchId: string,
  failure: PublishApplyFailure,
): Promise<void> {
  const now = new Date();

  if (failure.tableName != null && failure.rowPk != null) {
    await db.update(PublishBatchRow)
      .set({
        status: 'failed',
        error: failure.message,
        updatedAt: now,
      })
      .where(and(
        eq(PublishBatchRow.batchId, batchId),
        eq(PublishBatchRow.tableName, failure.tableName),
        eq(PublishBatchRow.rowPk, failure.rowPk),
      ));
  }

  await db.update(PublishBatch)
    .set({
      status: 'failed',
      error: failure.message,
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
    totalRowCount: input.counts.totalRowCount,
    changedRowCount: input.counts.changedRowCount,
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
        totalRowCount: input.counts.totalRowCount,
        changedRowCount: input.counts.changedRowCount,
        publishedAt: input.publishedAt,
        updatedAt: input.publishedAt,
      },
    });
}

/** Delete one row from the remote table using the parsed PK. */
async function deleteRemoteRow(
  tx: PublishDbTx,
  tableName: TableName,
  rowPk: Record<string, string>,
): Promise<void> {
  switch (tableName) {
    case 'cards':
      await tx.delete(RemoteCard).where(eq(RemoteCard.cardId, rowPk.cardId!));
      return;
    case 'entities':
      await tx.delete(RemoteEntity).where(and(
        eq(RemoteEntity.cardId, rowPk.cardId!),
        eq(RemoteEntity.revisionHash, rowPk.revisionHash!),
      ));
      return;
    case 'entity_localizations':
      await tx.delete(RemoteEntityLocalization).where(and(
        eq(RemoteEntityLocalization.cardId, rowPk.cardId!),
        eq(RemoteEntityLocalization.lang, rowPk.lang!),
        eq(RemoteEntityLocalization.revisionHash, rowPk.revisionHash!),
        eq(RemoteEntityLocalization.localizationHash, rowPk.localizationHash!),
      ));
      return;
    case 'entity_relations':
      await tx.delete(RemoteEntityRelation).where(and(
        eq(RemoteEntityRelation.sourceId, rowPk.sourceId!),
        eq(RemoteEntityRelation.sourceRevisionHash, rowPk.sourceRevisionHash!),
        eq(RemoteEntityRelation.relation, rowPk.relation!),
        eq(RemoteEntityRelation.targetId, rowPk.targetId!),
      ));
      return;
  }
}

/** Insert one row into the remote table. For cards, uses upsert semantics. */
async function insertRemoteRow(
  tx: PublishDbTx,
  tableName: TableName,
  row: unknown,
  action: 'insert' | 'update',
): Promise<void> {
  if (tableName === 'cards') {
    const cardRow = row as typeof LocalCard.$inferSelect;

    if (action === 'update') {
      await tx.insert(RemoteCard).values({
        cardId: cardRow.cardId,
        legalities: cardRow.legalities,
      })
        .onConflictDoUpdate({
          target: RemoteCard.cardId,
          set: { legalities: cardRow.legalities },
        });
    } else {
      await tx.insert(RemoteCard).values({
        cardId: cardRow.cardId,
        legalities: cardRow.legalities,
      })
        .onConflictDoNothing();
    }

    return;
  }

  if (tableName === 'entities') {
    const entityRow = row as typeof LocalEntity.$inferSelect;

    await tx.insert(RemoteEntity).values({ ...entityRow });
    return;
  }

  if (tableName === 'entity_localizations') {
    const locRow = row as typeof LocalEntityLocalization.$inferSelect;

    await tx.insert(RemoteEntityLocalization).values({ ...locRow });
    return;
  }

  const relRow = row as typeof LocalEntityRelation.$inferSelect;

  await tx.insert(RemoteEntityRelation).values({ ...relRow });
}

/** Structured remote-apply failure normalized from an unknown thrown value. */
function normalizePublishApplyFailure(error: unknown): PublishApplyFailure {
  if (typeof error === 'object' && error != null && 'message' in error && typeof error.message === 'string') {
    const tableName = 'tableName' in error && typeof error.tableName === 'string'
      ? error.tableName as TableName
      : null;
    const rowPk = 'rowPk' in error && typeof error.rowPk === 'string'
      ? error.rowPk
      : null;

    return { tableName, rowPk, message: error.message };
  }

  return { tableName: null, rowPk: null, message: getErrorMessage(error) };
}

/** Remote transaction that applies one publish batch at the row level. */
async function applyRowPlansToRemote(
  remoteDb: PublishDb,
  input: {
    data: CurrentRowData;
    plans: PublishBatchRowPlan[];
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
  try {
    await remoteDb.transaction(async tx => {
      for (const plan of input.plans) {
        try {
          if (plan.action === 'insert' || plan.action === 'update') {
            const rowPkParsed = parseRowPk(plan.rowPk);
            let row: unknown;

            switch (plan.tableName) {
              case 'cards':
                row = input.data.cards.get(plan.rowPk);

                break;
              case 'entities':
                row = input.data.entities.get(plan.rowPk);

                break;
              case 'entity_localizations':
                row = input.data.localizations.get(plan.rowPk);

                break;
              case 'entity_relations':
                row = input.data.relations.get(plan.rowPk);

                break;
            }

            if (row == null) {
              throw new Error(`Current row data for ${plan.tableName} ${plan.rowPk} is missing during remote apply.`);
            }

            if (plan.action === 'update' && plan.tableName !== 'cards') {
              await deleteRemoteRow(tx, plan.tableName, rowPkParsed);
            }

            await insertRemoteRow(tx, plan.tableName, row, plan.action);
            continue;
          }

          if (plan.action === 'delete') {
            const rowPkParsed = parseRowPk(plan.rowPk);

            await deleteRemoteRow(tx, plan.tableName, rowPkParsed);
          }
        } catch (error) {
          throw {
            tableName: plan.tableName,
            rowPk: plan.rowPk,
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
          tableName: null,
          rowPk: null,
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

  try {
    const { states, data } = await loadCurrentRowSnapshots(localDb);

    if (states.length === 0) {
      throw new Error('No latest local Hearthstone projection rows are available for publish.');
    }

    const entityRows = [...data.entities.values()];
    const range = await derivePublishDatasetRange(localDb, entityRows);
    const { baseline, previous } = await loadPreviousRowStates(localDb, target.publishTargetId);
    const previousManifestHash = baseline?.manifestHash ?? null;
    const { plans, counts, manifestHash } = buildRowPlans(states, previous);
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
    await insertPublishBatchRows(localDb, batchId, plans);
    await markPublishBatchApplying(localDb, batchId);

    try {
      await applyRowPlansToRemote(remoteDb, {
        data,
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

      await finalizePublishBatchFailure(localDb, batchId, failure);
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
      totalRowCount: counts.totalRowCount,
      changedRowCount: counts.changedRowCount,
      insertedRowCount: counts.insertedRowCount,
      updatedRowCount: counts.updatedRowCount,
      deletedRowCount: counts.deletedRowCount,
      unchangedRowCount: counts.unchangedRowCount,
      cardRowCount: counts.cardRowCount,
      entityRowCount: counts.entityRowCount,
      localizationRowCount: counts.localizationRowCount,
      relationRowCount: counts.relationRowCount,
      publishedAt: publishedAt.toISOString(),
    };
  } finally {
    await closePublishDb(remoteDb);
  }
}

/** Test-only publish helpers that lock row-level diff semantics in place. */
export const hsdataPublishTestUtils = {
  emptyHash,
  buildRowPlans,
  serializeRowPk,
  parseRowPk,
  cardsRowPk,
  entitiesRowPk,
  localizationsRowPk,
  relationsRowPk,
  cardRowHash,
  entityRowHash,
  localizationRowHash,
  relationRowHash,
};
