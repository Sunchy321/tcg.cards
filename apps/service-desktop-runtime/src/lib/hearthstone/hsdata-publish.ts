import { randomUUID } from 'node:crypto';

import { and, asc, count, desc, eq, gt, inArray, lte, ne } from 'drizzle-orm';
import { z } from 'zod';

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
import { getCurrentPublishJob } from './hsdata-publish-progress';
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

export const publishReport = z.object({
  batchId: z.string(),
  publishTargetId: z.string(),
  environment: z.string(),
  targetFingerprint: z.string(),
  publishType: z.string(),
  status: z.string(),
  manifestHash: z.string(),
  previousManifestHash: z.string().nullable(),
  sourceTagMin: z.number(),
  sourceTagMax: z.number(),
  buildMin: z.number(),
  buildMax: z.number(),
  totalRowCount: z.number(),
  changedRowCount: z.number(),
  insertedRowCount: z.number(),
  updatedRowCount: z.number(),
  deletedRowCount: z.number(),
  unchangedRowCount: z.number(),
  cardRowCount: z.number(),
  entityRowCount: z.number(),
  localizationRowCount: z.number(),
  relationRowCount: z.number(),
  publishedAt: z.string(),
  pendingRowCount: z.number().optional(),
});

export type PublishReport = z.infer<typeof publishReport>;

interface PublishApplyFailure {
  tableName: TableName | null;
  rowPk: string | null;
  message: string;
}

function toHex(hash: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < hash.length; i++) {
    hex += hash[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

function sha256Hex(input: string): string {
  return toHex(Bun.SHA256.hash(input) as Uint8Array);
}

const emptyHash = sha256Hex('[]');

const writeBatchSize = 500;

async function closePublishDb(db: PublishDb) {
  await db.$client.end({ timeout: 1 });
}

function hashJson(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
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
    sorted[key] = pk[key]!;
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

/** Progress event emitted by snapshot loading and batch-writing steps. */
type StepProgress = (event: {
  phase: string;
  message: string;
  completed?: number;
  total?: number;
}) => void;

/** All local rows loaded from all four publish tables and indexed by PK.
 *
 * When `previousHashes` and `lastPublishedAt` are provided, rows whose `updatedAt` is
 * not after `lastPublishedAt` skip hash computation and reuse the baseline hash instead.
 */
async function loadCurrentRowSnapshots(
  db: PublishDb,
  onProgress: StepProgress | undefined,
  previousHashes: Map<TableName, Map<string, string>> | undefined,
  lastPublishedAt: Date | null | undefined,
): Promise<{
    states: PublishRowState[];
    data: CurrentRowData;
    allEntityVersions: number[][];
  }> {
  const incrCutoff = lastPublishedAt?.getTime() ?? 0;
  const hasBaseline = lastPublishedAt != null;
  const cutoffDate = hasBaseline ? new Date(incrCutoff) : null;

  // --- Entities ---
  onProgress?.({ phase: 'loading_snapshots', message: '正在加载 entities...' });

  let entityChangedRows: (typeof LocalEntity.$inferSelect)[];
  let entityUnchangedRows: { cardId: string; revisionHash: string; version: number[] }[];

  if (hasBaseline && cutoffDate) {
    entityChangedRows = await db.select()
      .from(LocalEntity)
      .where(gt(LocalEntity.updatedAt, cutoffDate))
      .orderBy(asc(LocalEntity.cardId), asc(LocalEntity.revisionHash));
    entityUnchangedRows = await db.select({
      cardId: LocalEntity.cardId,
      revisionHash: LocalEntity.revisionHash,
      version: LocalEntity.version,
    })
      .from(LocalEntity)
      .where(lte(LocalEntity.updatedAt, cutoffDate));
  } else {
    entityChangedRows = await db.select()
      .from(LocalEntity)
      .orderBy(asc(LocalEntity.cardId), asc(LocalEntity.revisionHash));
    entityUnchangedRows = [];
  }

  const cardIds = new Set<string>();

  for (const row of entityChangedRows) {
    cardIds.add(row.cardId);
  }

  for (const row of entityUnchangedRows) {
    cardIds.add(row.cardId);
  }

  if (cardIds.size === 0) {
    return { states: [], data: { cards: new Map(), entities: new Map(), localizations: new Map(), relations: new Map() }, allEntityVersions: [] };
  }

  // --- Localizations ---
  const entityTotal = entityChangedRows.length + entityUnchangedRows.length;

  onProgress?.({ phase: 'loading_snapshots', message: '正在加载 localizations...', completed: entityTotal });

  let localizationChangedRows: (typeof LocalEntityLocalization.$inferSelect)[];
  let localizationUnchangedRows: { cardId: string; lang: string; revisionHash: string; localizationHash: string }[];

  if (hasBaseline && cutoffDate) {
    localizationChangedRows = await db.select()
      .from(LocalEntityLocalization)
      .where(gt(LocalEntityLocalization.updatedAt, cutoffDate))
      .orderBy(
        asc(LocalEntityLocalization.cardId),
        asc(LocalEntityLocalization.lang),
        asc(LocalEntityLocalization.revisionHash),
        asc(LocalEntityLocalization.localizationHash),
      );
    localizationUnchangedRows = await db.select({
      cardId: LocalEntityLocalization.cardId,
      lang: LocalEntityLocalization.lang,
      revisionHash: LocalEntityLocalization.revisionHash,
      localizationHash: LocalEntityLocalization.localizationHash,
    })
      .from(LocalEntityLocalization)
      .where(lte(LocalEntityLocalization.updatedAt, cutoffDate));
  } else {
    localizationChangedRows = await db.select()
      .from(LocalEntityLocalization)
      .orderBy(
        asc(LocalEntityLocalization.cardId),
        asc(LocalEntityLocalization.lang),
        asc(LocalEntityLocalization.revisionHash),
        asc(LocalEntityLocalization.localizationHash),
      );
    localizationUnchangedRows = [];
  }

  // --- Relations ---
  onProgress?.({ phase: 'loading_snapshots', message: '正在加载 relations...', completed: entityTotal });

  let relationChangedRows: (typeof LocalEntityRelation.$inferSelect)[];
  let relationUnchangedRows: { sourceId: string; sourceRevisionHash: string; relation: string; targetId: string }[];

  if (hasBaseline && cutoffDate) {
    relationChangedRows = await db.select()
      .from(LocalEntityRelation)
      .where(gt(LocalEntityRelation.updatedAt, cutoffDate))
      .orderBy(
        asc(LocalEntityRelation.sourceId),
        asc(LocalEntityRelation.relation),
        asc(LocalEntityRelation.targetId),
        asc(LocalEntityRelation.sourceRevisionHash),
      );
    relationUnchangedRows = await db.select({
      sourceId: LocalEntityRelation.sourceId,
      sourceRevisionHash: LocalEntityRelation.sourceRevisionHash,
      relation: LocalEntityRelation.relation,
      targetId: LocalEntityRelation.targetId,
    })
      .from(LocalEntityRelation)
      .where(lte(LocalEntityRelation.updatedAt, cutoffDate));
  } else {
    relationChangedRows = await db.select()
      .from(LocalEntityRelation)
      .orderBy(
        asc(LocalEntityRelation.sourceId),
        asc(LocalEntityRelation.relation),
        asc(LocalEntityRelation.targetId),
        asc(LocalEntityRelation.sourceRevisionHash),
      );
    relationUnchangedRows = [];
  }

  // --- Cards ---
  onProgress?.({ phase: 'loading_snapshots', message: '正在加载 cards...' });
  const sortedCardIds = [...cardIds].sort();

  let cardChangedRows: (typeof LocalCard.$inferSelect)[];
  let cardUnchangedRows: { cardId: string }[];

  if (hasBaseline && cutoffDate) {
    cardChangedRows = await db.select()
      .from(LocalCard)
      .where(and(
        inArray(LocalCard.cardId, sortedCardIds),
        gt(LocalCard.updatedAt, cutoffDate),
      ))
      .orderBy(asc(LocalCard.cardId));
    cardUnchangedRows = await db.select({ cardId: LocalCard.cardId })
      .from(LocalCard)
      .where(and(
        inArray(LocalCard.cardId, sortedCardIds),
        lte(LocalCard.updatedAt, cutoffDate),
      ));
  } else {
    cardChangedRows = await db.select()
      .from(LocalCard)
      .where(inArray(LocalCard.cardId, sortedCardIds))
      .orderBy(asc(LocalCard.cardId));
    cardUnchangedRows = [];
  }

  const cardChangedMap = new Map(cardChangedRows.map(row => [row.cardId, row]));
  const cardUnchangedSet = new Set(cardUnchangedRows.map(row => row.cardId));

  // --- Build states and data ---
  const data: CurrentRowData = {
    cards: new Map(),
    entities: new Map(),
    localizations: new Map(),
    relations: new Map(),
  };
  const states: PublishRowState[] = [];
  const allEntityVersions: number[][] = [];

  const localizationTotal = localizationChangedRows.length + localizationUnchangedRows.length;
  const relationTotal = relationChangedRows.length + relationUnchangedRows.length;
  const hashTotal = entityTotal + localizationTotal + relationTotal + sortedCardIds.length;

  let hashCount = 0;
  let lastReport = 0;
  const reportEvery = 2000;

  function maybeReport() {
    if (hashCount - lastReport >= reportEvery && onProgress) {
      onProgress({ phase: 'loading_snapshots', message: '正在计算行 hash...', completed: hashCount, total: hashTotal });
      lastReport = hashCount;
    }
  }

  onProgress?.({ phase: 'loading_snapshots', message: '正在计算 entities 行 hash...', completed: 0, total: hashTotal });

  const prevEntityHashes = previousHashes?.get('entities');

  for (const row of entityChangedRows) {
    const pk = entitiesRowPk(row);

    data.entities.set(pk, row);
    allEntityVersions.push(row.version);

    states.push({
      tableName: 'entities',
      rowPk: pk,
      rowHash: entityRowHash(row),
    });
    hashCount += 1;
    maybeReport();
  }

  for (const row of entityUnchangedRows) {
    const pk = serializeRowPk({ cardId: row.cardId, revisionHash: row.revisionHash });
    const prevHash = prevEntityHashes?.get(pk);

    allEntityVersions.push(row.version);

    states.push({
      tableName: 'entities',
      rowPk: pk,
      rowHash: prevHash ?? '',
    });
    hashCount += 1;
    maybeReport();
  }

  onProgress?.({ phase: 'loading_snapshots', message: '正在计算 localizations 行 hash...', completed: hashCount, total: hashTotal });

  const prevLocalizationHashes = previousHashes?.get('entity_localizations');

  for (const row of localizationChangedRows) {
    const pk = localizationsRowPk(row);

    data.localizations.set(pk, row);

    states.push({
      tableName: 'entity_localizations',
      rowPk: pk,
      rowHash: localizationRowHash(row),
    });
    hashCount += 1;
    maybeReport();
  }

  for (const row of localizationUnchangedRows) {
    const pk = serializeRowPk({ cardId: row.cardId, lang: row.lang, revisionHash: row.revisionHash, localizationHash: row.localizationHash });
    const prevHash = prevLocalizationHashes?.get(pk);

    states.push({
      tableName: 'entity_localizations',
      rowPk: pk,
      rowHash: prevHash ?? '',
    });
    hashCount += 1;
    maybeReport();
  }

  onProgress?.({ phase: 'loading_snapshots', message: '正在计算 relations 行 hash...', completed: hashCount, total: hashTotal });

  const prevRelationHashes = previousHashes?.get('entity_relations');

  for (const row of relationChangedRows) {
    const pk = relationsRowPk(row);

    data.relations.set(pk, row);

    states.push({
      tableName: 'entity_relations',
      rowPk: pk,
      rowHash: relationRowHash(row),
    });
    hashCount += 1;
    maybeReport();
  }

  for (const row of relationUnchangedRows) {
    const pk = serializeRowPk({ sourceId: row.sourceId, sourceRevisionHash: row.sourceRevisionHash, relation: row.relation, targetId: row.targetId });
    const prevHash = prevRelationHashes?.get(pk);

    states.push({
      tableName: 'entity_relations',
      rowPk: pk,
      rowHash: prevHash ?? '',
    });
    hashCount += 1;
    maybeReport();
  }

  onProgress?.({ phase: 'loading_snapshots', message: '正在计算 cards 行 hash...', completed: hashCount, total: hashTotal });

  const prevCardHashes = previousHashes?.get('cards');

  for (const cardId of sortedCardIds) {
    if (cardUnchangedSet.has(cardId)) {
      const pk = serializeRowPk({ cardId });
      const prevHash = prevCardHashes?.get(pk);

      states.push({
        tableName: 'cards',
        rowPk: pk,
        rowHash: prevHash ?? '',
      });
      hashCount += 1;
      maybeReport();
      continue;
    }

    const card = cardChangedMap.get(cardId) ?? {
      cardId,
      legalities: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies typeof LocalCard.$inferSelect;
    const pk = cardsRowPk(card);

    data.cards.set(pk, card);

    states.push({
      tableName: 'cards',
      rowPk: pk,
      rowHash: cardRowHash(card),
    });
    hashCount += 1;
    maybeReport();
  }

  // Final report to ensure the frontend reaches 100%
  if (hashCount !== lastReport) {
    onProgress?.({ phase: 'loading_snapshots', message: '行 hash 计算完成', completed: hashCount, total: hashTotal });
  }

  return { states, data, allEntityVersions };
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
  allEntityVersions: number[][],
): Promise<PublishDatasetRange> {
  const builds = [...new Set(allEntityVersions.flat())].sort((left, right) => left - right);

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
    publishType: string;
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
    publishType: input.publishType,
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
    status: 'planning',
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
  onProgress?: StepProgress,
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

  const chunks = chunkValues(rows);
  let completed = 0;

  for (const chunk of chunks) {
    if (chunk.length === 0) {
      continue;
    }

    await db.insert(PublishBatchRow).values(chunk);
    completed += chunk.length;
    onProgress?.({ phase: 'writing_batch_rows', message: '正在写入批次行...', completed, total: rows.length });
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

    // Clean up batch rows from old completed batches for this target
    const oldBatchIds = await db.select({ id: PublishBatch.id })
      .from(PublishBatch)
      .where(and(
        eq(PublishBatch.publishTargetId, input.publishTargetId),
        eq(PublishBatch.status, 'completed'),
        ne(PublishBatch.id, input.batchId),
      ))
      .then(rows => rows.map(r => r.id));

    if (oldBatchIds.length > 0) {
      await db.delete(PublishBatchRow)
        .where(inArray(PublishBatchRow.batchId, oldBatchIds));
    }
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

    await tx.insert(RemoteEntity).values({ ...entityRow }).onConflictDoNothing();
    return;
  }

  if (tableName === 'entity_localizations') {
    const locRow = row as typeof LocalEntityLocalization.$inferSelect;

    await tx.insert(RemoteEntityLocalization).values({ ...locRow }).onConflictDoNothing();
    return;
  }

  const relRow = row as typeof LocalEntityRelation.$inferSelect;

  await tx.insert(RemoteEntityRelation).values({ ...relRow }).onConflictDoNothing();
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
    onProgress?: (completed: number) => void;
  },
): Promise<void> {
  let completed = 0;

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

          if (plan.action !== 'unchanged') {
            completed += 1;
            input.onProgress?.(completed);
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

/** Number of pending rows to apply per remote transaction during chunked execution. */
const remoteChunkSize = 5000;

/** Plan phase: load data, diff, write batch + rows. Returns metadata needed for execution. */
export async function createPublishPlan(options?: {
  publishType?: string;
  dryRun?: boolean;
  onProgress?: StepProgress;
}): Promise<{
    batchId: string;
    counts: PublishBatchCounts;
    range: PublishDatasetRange;
    manifestHash: string;
    previousManifestHash: string | null;
  }> {
  const publishType = options?.publishType ?? 'card_data';
  const dryRun = options?.dryRun ?? false;
  const onProgress = options?.onProgress;
  const target = requireHearthstonePublishTarget();
  const localDb = getLocalDb();

  // Prevent creating a new plan while another is still applying
  const active = await localDb.select()
    .from(PublishBatch)
    .where(and(
      eq(PublishBatch.publishTargetId, target.publishTargetId),
      eq(PublishBatch.status, 'applying'),
    ))
    .then(rows => rows[0] ?? null);

  if (active) {
    throw new Error(`已有执行中的发布批次 ${active.id}，请先完成或等待其结束后再开始新的发布。`);
  }

  onProgress?.({ phase: 'loading_baseline', message: '正在加载上次发布基线...' });

  const { baseline, previous } = await loadPreviousRowStates(localDb, target.publishTargetId);
  const previousManifestHash = baseline?.manifestHash ?? null;
  const lastPublishedAt = baseline?.publishedAt ?? null;

  const { states, data, allEntityVersions } = await loadCurrentRowSnapshots(localDb, onProgress, previous, lastPublishedAt);

  if (states.length === 0) {
    throw new Error('No local Hearthstone projection rows are available for publish.');
  }

  onProgress?.({ phase: 'deriving_range', message: '正在推导版本范围...' });

  const range = await derivePublishDatasetRange(localDb, allEntityVersions);

  onProgress?.({ phase: 'building_diff', message: '正在构建差异计划...', completed: 0, total: states.length });

  const { plans, counts, manifestHash } = buildRowPlans(states, previous);

  onProgress?.({ phase: 'building_diff', message: '差异计划构建完成', completed: states.length, total: states.length });

  if (dryRun) {
    return { batchId: '', counts, range, manifestHash, previousManifestHash };
  }

  onProgress?.({ phase: 'writing_batch', message: '正在写入批次元数据...' });

  const batchId = randomUUID();

  await insertPublishBatch(localDb, {
    batchId,
    publishTargetId: target.publishTargetId,
    environment: target.environment,
    targetFingerprint: target.targetFingerprint,
    publishType,
    range,
    manifestHash,
    previousManifestHash,
    counts,
  });
  await insertPublishBatchRows(localDb, batchId, plans, onProgress);

  await localDb.update(PublishBatch)
    .set({ status: 'applying', updatedAt: new Date() })
    .where(eq(PublishBatch.id, batchId));

  return { batchId, counts, range, manifestHash, previousManifestHash };
}

/** Load one chunk of local row data keyed by rowPk for a given table. */
async function loadRowDataChunk(
  db: PublishDb,
  tableName: TableName,
  rowPks: string[],
): Promise<Map<string, unknown>> {
  const result = new Map<string, unknown>();

  if (rowPks.length === 0) return result;

  switch (tableName) {
    case 'cards': {
      const cardIds = rowPks.map(pk => parseRowPk(pk).cardId!);
      const rows = await db.select().from(LocalCard).where(inArray(LocalCard.cardId, cardIds));

      for (const row of rows) {
        result.set(cardsRowPk(row), row);
      }

      break;
    }
    case 'entities': {
      const pks = rowPks.map(pk => parseRowPk(pk));
      const cardIds = [...new Set(pks.map(p => p.cardId!))];

      if (cardIds.length === 0) break;

      const revisionHashes = [...new Set(pks.map(p => p.revisionHash!))];
      const rows = await db.select().from(LocalEntity)
        .where(and(
          inArray(LocalEntity.cardId, cardIds),
          inArray(LocalEntity.revisionHash, revisionHashes),
        ));

      for (const row of rows) {
        result.set(entitiesRowPk(row), row);
      }

      break;
    }
    case 'entity_localizations': {
      const pks = rowPks.map(pk => parseRowPk(pk));
      const cardIds = [...new Set(pks.map(p => p.cardId!))];

      if (cardIds.length === 0) break;

      const langs = [...new Set(pks.map(p => p.lang!))];
      const revisionHashes = [...new Set(pks.map(p => p.revisionHash!))];
      const localizationHashes = [...new Set(pks.map(p => p.localizationHash!))];

      const rows = await db.select().from(LocalEntityLocalization)
        .where(and(
          inArray(LocalEntityLocalization.cardId, cardIds),
          inArray(LocalEntityLocalization.lang, langs),
          inArray(LocalEntityLocalization.revisionHash, revisionHashes),
          inArray(LocalEntityLocalization.localizationHash, localizationHashes),
        ));

      for (const row of rows) {
        result.set(localizationsRowPk(row), row);
      }

      break;
    }
    case 'entity_relations': {
      const pks = rowPks.map(pk => parseRowPk(pk));
      const sourceIds = [...new Set(pks.map(p => p.sourceId!))];

      if (sourceIds.length === 0) break;

      const sourceRevisionHashes = [...new Set(pks.map(p => p.sourceRevisionHash!))];
      const relations = [...new Set(pks.map(p => p.relation!))];
      const targetIds = [...new Set(pks.map(p => p.targetId!))];

      const rows = await db.select().from(LocalEntityRelation)
        .where(and(
          inArray(LocalEntityRelation.sourceId, sourceIds),
          inArray(LocalEntityRelation.sourceRevisionHash, sourceRevisionHashes),
          inArray(LocalEntityRelation.relation, relations),
          inArray(LocalEntityRelation.targetId, targetIds),
        ));

      for (const row of rows) {
        result.set(relationsRowPk(row), row);
      }

      break;
    }
  }

  return result;
}

/** Build one PublishReport from a completed PublishBatch row. */
function buildPublishReport(
  batch: typeof PublishBatch.$inferSelect,
  publishedAt: Date | string,
): PublishReport {
  const at = typeof publishedAt === 'string' ? publishedAt : publishedAt.toISOString();

  return {
    batchId: batch.id,
    publishTargetId: batch.publishTargetId,
    environment: batch.environment,
    targetFingerprint: batch.targetFingerprint,
    publishType: batch.publishType,
    status: batch.status,
    manifestHash: batch.manifestHash,
    previousManifestHash: batch.previousManifestHash ?? null,
    sourceTagMin: batch.sourceTagMin,
    sourceTagMax: batch.sourceTagMax,
    buildMin: batch.buildMin,
    buildMax: batch.buildMax,
    totalRowCount: batch.totalRowCount,
    changedRowCount: batch.changedRowCount,
    insertedRowCount: batch.insertedRowCount,
    updatedRowCount: batch.updatedRowCount,
    deletedRowCount: batch.deletedRowCount,
    unchangedRowCount: batch.unchangedRowCount,
    cardRowCount: batch.cardRowCount,
    entityRowCount: batch.entityRowCount,
    localizationRowCount: batch.localizationRowCount,
    relationRowCount: batch.relationRowCount,
    publishedAt: at,
  };
}

/** Execute phase: apply one publish batch to remote in chunked transactions.
 *
 * Each chunk runs in its own remote transaction. On success, the corresponding
 * publish_batch_rows are marked applied. If the process crashes mid-execution,
 * re-calling this function will skip already-applied rows and resume from the
 * first pending row.
 */
export async function executePublishBatch(
  batchId: string,
  options?: {
    onProgress?: (event: { phase: string; message: string; totalRowCount?: number | null; completedRowCount?: number | null }) => void;
  },
): Promise<PublishReport> {
  const onProgress = options?.onProgress;
  const target = requireHearthstonePublishTarget();
  const localDb = getLocalDb();
  const remoteDb = createDb(target.connectionString);

  try {
    const batch = await localDb.select().from(PublishBatch).where(eq(PublishBatch.id, batchId)).then(r => r[0]);

    if (!batch) {
      throw new Error(`Publish batch ${batchId} not found.`);
    }

    if (batch.status === 'completed') {
      return buildPublishReport(batch, batch.completedAt ?? batch.updatedAt);
    }

    if (batch.status === 'planning') {
      await localDb.update(PublishBatch)
        .set({ status: 'applying', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(PublishBatch.id, batchId));
    }

    // Load pending rows, sorted by table then PK for deterministic order
    const pendingRows = await localDb.select()
      .from(PublishBatchRow)
      .where(and(
        eq(PublishBatchRow.batchId, batchId),
        eq(PublishBatchRow.status, 'pending'),
      ))
      .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowPk));

    const totalPending = pendingRows.length;

    if (totalPending === 0) {
      onProgress?.({ phase: 'applying_remote', message: '所有行已应用完毕', totalRowCount: 0, completedRowCount: 0 });
    } else {
      onProgress?.({ phase: 'applying_remote', message: '正在应用到远程数据库...', totalRowCount: totalPending, completedRowCount: 0 });
    }

    let completedCount = 0;
    const totalChunks = Math.ceil(totalPending / remoteChunkSize);

    for (let i = 0; i < pendingRows.length; i += remoteChunkSize) {
      const chunkIndex = i / remoteChunkSize + 1;
      const chunk = pendingRows.slice(i, i + remoteChunkSize);

      // Group chunk rows by table for batched local lookups
      const byTable = new Map<TableName, typeof chunk>();

      for (const row of chunk) {
        const tn = row.tableName as TableName;

        if (!byTable.has(tn)) byTable.set(tn, []);
        byTable.get(tn)!.push(row);
      }

      const rowDataMap = new Map<string, unknown>();

      for (const [tableName, rows] of byTable) {
        const pkSet = [...new Set(rows.map(r => r.rowPk))];
        const chunkData = await loadRowDataChunk(localDb, tableName, pkSet);

        for (const [pk, data] of chunkData) {
          rowDataMap.set(`${tableName}:${pk}`, data);
        }
      }

      try {
        await remoteDb.transaction(async tx => {
          for (const row of chunk) {
            const tableName = row.tableName as TableName;
            const rowData = rowDataMap.get(`${tableName}:${row.rowPk}`);

            if (rowData == null && row.action !== 'delete') {
              throw new Error(`Row data not found: ${tableName} ${row.rowPk}`);
            }

            if (row.action === 'insert') {
              await insertRemoteRow(tx, tableName, rowData!, 'insert');
            } else if (row.action === 'update') {
              if (tableName !== 'cards') {
                await deleteRemoteRow(tx, tableName, parseRowPk(row.rowPk));
              }

              await insertRemoteRow(tx, tableName, rowData!, 'update');
            } else if (row.action === 'delete') {
              await deleteRemoteRow(tx, tableName, parseRowPk(row.rowPk));
            }
          }
        });

        // Mark chunk rows as applied on the local database after remote commit
        for (const row of chunk) {
          await localDb.update(PublishBatchRow)
            .set({
              status: row.action === 'unchanged' ? 'skipped' : 'applied',
              updatedAt: new Date(),
              appliedAt: new Date(),
            })
            .where(and(
              eq(PublishBatchRow.batchId, batchId),
              eq(PublishBatchRow.tableName, row.tableName),
              eq(PublishBatchRow.rowPk, row.rowPk),
            ));
        }
      } catch (error) {
        const message = getErrorMessage(error);

        // Keep rows as pending and batch as applying so resume will retry
        await localDb.update(PublishBatch)
          .set({ error: message, updatedAt: new Date() })
          .where(eq(PublishBatch.id, batchId));

        throw new Error(`第 ${chunkIndex}/${totalChunks} 块执行失败: ${message}`);
      }

      completedCount += chunk.length;
      onProgress?.({ phase: 'applying_remote', message: `正在应用第 ${chunkIndex}/${totalChunks} 块...`, totalRowCount: totalPending, completedRowCount: completedCount });
    }

    onProgress?.({ phase: 'finalizing', message: '正在完成发布...' });

    const publishedAt = new Date();

    await remoteDb.transaction(async tx => {
      await upsertRemotePublishLedger(tx, {
        batchId,
        publishTargetId: batch.publishTargetId,
        environment: batch.environment,
        targetFingerprint: batch.targetFingerprint,
        range: { sourceTagMin: batch.sourceTagMin, sourceTagMax: batch.sourceTagMax, buildMin: batch.buildMin, buildMax: batch.buildMax },
        counts: {
          totalRowCount: batch.totalRowCount,
          changedRowCount: batch.changedRowCount,
          insertedRowCount: batch.insertedRowCount,
          updatedRowCount: batch.updatedRowCount,
          deletedRowCount: batch.deletedRowCount,
          unchangedRowCount: batch.unchangedRowCount,
          cardRowCount: batch.cardRowCount,
          entityRowCount: batch.entityRowCount,
          localizationRowCount: batch.localizationRowCount,
          relationRowCount: batch.relationRowCount,
        },
        manifestHash: batch.manifestHash,
        publishedAt,
      });
    });

    await finalizePublishBatchSuccess(localDb, {
      batchId,
      publishTargetId: batch.publishTargetId,
      environment: batch.environment,
      targetFingerprint: batch.targetFingerprint,
      range: { sourceTagMin: batch.sourceTagMin, sourceTagMax: batch.sourceTagMax, buildMin: batch.buildMin, buildMax: batch.buildMax },
      counts: {
        totalRowCount: batch.totalRowCount,
        changedRowCount: batch.changedRowCount,
        insertedRowCount: batch.insertedRowCount,
        updatedRowCount: batch.updatedRowCount,
        deletedRowCount: batch.deletedRowCount,
        unchangedRowCount: batch.unchangedRowCount,
        cardRowCount: batch.cardRowCount,
        entityRowCount: batch.entityRowCount,
        localizationRowCount: batch.localizationRowCount,
        relationRowCount: batch.relationRowCount,
      },
      manifestHash: batch.manifestHash,
      plans: [],
      publishedAt,
    });

    await localDb.update(PublishBatch)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(PublishBatch.id, batchId));

    return buildPublishReport(batch, publishedAt);
  } finally {
    await closePublishDb(remoteDb);
  }
}

/** Runs plan + execute in one call. Auto-detects and resumes incomplete batches. */
export async function publishCurrentHsdataToRemote(options?: {
  publishType?: string;
  dryRun?: boolean;
  onProgress?: (event: { phase: string; message: string; totalRowCount?: number | null; completedRowCount?: number | null }) => void;
}): Promise<PublishReport> {
  const onProgress = options?.onProgress;
  const dryRun = options?.dryRun ?? false;
  const localDb = getLocalDb();

  // Dry run: only analyze, skip all writes
  if (dryRun) {
    const plan = await createPublishPlan({
      publishType: options?.publishType,
      dryRun: true,
      onProgress: onProgress
        ? (e) => onProgress({ phase: e.phase, message: e.message, totalRowCount: e.total ?? null, completedRowCount: e.completed ?? null })
        : undefined,
    });

    const target = requireHearthstonePublishTarget();

    return {
      batchId: '',
      publishTargetId: target.publishTargetId,
      environment: target.environment,
      targetFingerprint: target.targetFingerprint,
      publishType: options?.publishType ?? 'card_data',
      status: 'dry_run',
      manifestHash: plan.manifestHash,
      previousManifestHash: plan.previousManifestHash,
      sourceTagMin: plan.range.sourceTagMin,
      sourceTagMax: plan.range.sourceTagMax,
      buildMin: plan.range.buildMin,
      buildMax: plan.range.buildMax,
      totalRowCount: plan.counts.totalRowCount,
      changedRowCount: plan.counts.changedRowCount,
      insertedRowCount: plan.counts.insertedRowCount,
      updatedRowCount: plan.counts.updatedRowCount,
      deletedRowCount: plan.counts.deletedRowCount,
      unchangedRowCount: plan.counts.unchangedRowCount,
      cardRowCount: plan.counts.cardRowCount,
      entityRowCount: plan.counts.entityRowCount,
      localizationRowCount: plan.counts.localizationRowCount,
      relationRowCount: plan.counts.relationRowCount,
      publishedAt: new Date().toISOString(),
    };
  }

  // Check for incomplete batches to resume
  const incomplete = await localDb.select()
    .from(PublishBatch)
    .where(
      inArray(PublishBatch.status, ['planning', 'applying']),
    )
    .orderBy(asc(PublishBatch.createdAt))
    .then(rows => rows[rows.length - 1] ?? null);

  if (incomplete) {
    onProgress?.({ phase: 'loading_snapshots', message: `检测到未完成的批次 ${incomplete.id}，将从断点继续...`, totalRowCount: null, completedRowCount: null });

    return await executePublishBatch(incomplete.id, options);
  }

  const plan = await createPublishPlan({
    publishType: options?.publishType,
    onProgress: onProgress
      ? (e) => onProgress({ phase: e.phase, message: e.message, totalRowCount: e.total ?? null, completedRowCount: e.completed ?? null })
      : undefined,
  });

  return await executePublishBatch(plan.batchId, options);
}

/** Lists all publish batches for the current target, newest first. */
export async function listPublishBatches(): Promise<PublishReport[]> {
  const target = requireHearthstonePublishTarget();
  const localDb = getLocalDb();

  const batches = await localDb.select()
    .from(PublishBatch)
    .where(eq(PublishBatch.publishTargetId, target.publishTargetId))
    .orderBy(desc(PublishBatch.createdAt))
    .limit(50);

  return batches.map(b => buildPublishReport(b, b.completedAt ?? b.createdAt));
}

/** Checks whether a publish job is currently running in this server process. */
export async function getIncompletePublishBatch(): Promise<PublishReport | null> {
  const job = getCurrentPublishJob();

  if (!job) return null;

  const localDb = getLocalDb();
  const batch = await localDb.select()
    .from(PublishBatch)
    .where(eq(PublishBatch.id, job.batchId))
    .then(rows => rows[0] ?? null);

  if (!batch) return null;

  const pendingCount = await localDb.select({ count: count() })
    .from(PublishBatchRow)
    .where(and(
      eq(PublishBatchRow.batchId, job.batchId),
      eq(PublishBatchRow.status, 'pending'),
    ))
    .then(r => r[0]?.count ?? 0);

  const report = buildPublishReport(batch, batch.completedAt ?? batch.createdAt);

  return { ...report, pendingRowCount: pendingCount } as PublishReport & { pendingRowCount: number };
}

/** Test-only publish helpers that lock row-level diff semantics in place. */
export const hsdataPublishTestUtils = {
  emptyHash,
  buildRowPlans,
  loadRowDataChunk,
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

export const singleCardPublishReport = z.object({
  cardId: z.string(),
  entityCount: z.number(),
  localizationCount: z.number(),
  relationCount: z.number(),
  cardCount: z.number(),
});

export type SingleCardPublishReport = z.infer<typeof singleCardPublishReport>;

/** Publishes a single card from local projection tables to the remote target. */
export async function publishSingleCard(cardId: string): Promise<SingleCardPublishReport> {
  const target = requireHearthstonePublishTarget();
  const localDb = getLocalDb();
  const remoteDb = createDb(target.connectionString);

  try {
    const entities = await localDb.select().from(LocalEntity).where(eq(LocalEntity.cardId, cardId));
    const localizations = await localDb.select().from(LocalEntityLocalization).where(eq(LocalEntityLocalization.cardId, cardId));
    const relations = await localDb.select().from(LocalEntityRelation).where(eq(LocalEntityRelation.sourceId, cardId));
    const cards = await localDb.select().from(LocalCard).where(eq(LocalCard.cardId, cardId));

    await remoteDb.transaction(async tx => {
      await tx.delete(RemoteEntity).where(eq(RemoteEntity.cardId, cardId));
      for (const row of entities) {
        await tx.insert(RemoteEntity).values(row);
      }

      await tx.delete(RemoteEntityLocalization).where(eq(RemoteEntityLocalization.cardId, cardId));
      for (const row of localizations) {
        await tx.insert(RemoteEntityLocalization).values(row);
      }

      await tx.delete(RemoteEntityRelation).where(eq(RemoteEntityRelation.sourceId, cardId));
      for (const row of relations) {
        await tx.insert(RemoteEntityRelation).values(row);
      }

      if (cards.length > 0) {
        const card = cards[0]!;
        await tx.insert(RemoteCard).values(card)
          .onConflictDoUpdate({
            target: RemoteCard.cardId,
            set: { legalities: card.legalities },
          });
      }
    });

    return { cardId, entityCount: entities.length, localizationCount: localizations.length, relationCount: relations.length, cardCount: cards.length };
  } finally {
    await remoteDb.$client.end({ timeout: 1 });
  }
}
