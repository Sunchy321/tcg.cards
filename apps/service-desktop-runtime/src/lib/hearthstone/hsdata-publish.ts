import { and, count, desc, eq, gt, inArray, isNotNull, lte, or, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { PublishStream } from '@tcg-cards/model/src/game-data-sync';
import type { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

import { createDb } from '@tcg-cards/db';
import {
  Card as LocalCard,
  Entity as LocalEntity,
  EntityLocalization as LocalEntityLocalization,
  EntityRelation as LocalEntityRelation,
  Patch as LocalPatch,
  PublishBaseline,
  PublishBatch,
  PublishBatchRow,
  PublishRowBaseline,
} from '@tcg-cards/db/schema/local/hearthstone';
import {
  BaseCard as RemoteBaseCard,
  BaseEntity as RemoteBaseEntity,
  BaseEntityLocalization as RemoteBaseEntityLocalization,
  BaseEntityRelation as RemoteBaseEntityRelation,
  Patch as RemotePatch,
} from '@tcg-cards/db/schema/remote/hearthstone';
import {
  PublishLedger,
  PublishStreamRegistration,
} from '@tcg-cards/db/schema/remote/publish';

import {
  type PublishGeneration,
} from './publish-generation';
import { getLocalDb } from './hsdata-local-db';
import { getCurrentPublishJob } from './hsdata-publish-progress';
import {
  requireHearthstonePublishTarget,
  requireHearthstonePublishTargetByIdentity,
} from './hsdata-publish-target';

export type PublishDb = ReturnType<typeof createDb>;

type PublishDbTx = Parameters<Parameters<PublishDb['transaction']>[0]>[0];

export type TableName = 'cards' | 'entities' | 'entity_localizations' | 'entity_relations' | 'patches';

interface PublishRowState {
  tableName: TableName;
  rowKey:    string;
  rowHash:   string;
}

export interface PinCounts {
  totalRowCount:        number;
  cardRowCount:         number;
  entityRowCount:       number;
  localizationRowCount: number;
  relationRowCount:     number;
}

interface PublishBatchRowPlan {
  tableName:       TableName;
  rowKey:          string;
  rowHash:         string;
  previousRowHash: string | null;
  action:          typeof PublishBatchRow.$inferSelect['action'];
}

export interface PublishDatasetRange {
  buildMin: number;
  buildMax: number;
}

export type GenerationFingerprint = PublishGeneration['fingerprint'];
export type GenerationOrder = PublishGeneration['order'];

interface PublishTargetSelector {
  publishTarget?: string;
  environment?:   string;
}

/** Reads whether one caller has requested a cooperative stop for the current publish flow. */
export interface PublishStopSignal {
  readonly aborted: boolean;
}

/** Publish target resolved from one explicit stream identity when provided. */
function resolvePublishTargetSelector(selector?: PublishTargetSelector) {
  if (selector?.publishTarget != null && selector.environment != null) {
    return requireHearthstonePublishTargetByIdentity(
      selector.publishTarget,
      selector.environment,
    );
  }

  return requireHearthstonePublishTarget();
}

/** Describes one publish-owned stream identity used by baseline and ledger state. */
interface PublishStreamIdentity extends PublishStream {
  targetFingerprint: string;
}

export interface PublishBatchCounts {
  totalRowCount:        number;
  changedRowCount:      number;
  insertedRowCount:     number;
  updatedRowCount:      number;
  deletedRowCount:      number;
  unchangedRowCount:    number;
  cardRowCount:         number;
  entityRowCount:       number;
  localizationRowCount: number;
  relationRowCount:     number;
}

export const publishReport = z.object({
  batchId:              z.string(),
  publishTarget:        z.string(),
  environment:          z.string(),
  targetFingerprint:    z.string(),
  publishType:          z.string(),
  operationKind:        z.string(),
  status:               z.string(),
  manifestHash:         z.string(),
  previousManifestHash: z.string().nullable(),
  buildMin:             z.number(),
  buildMax:             z.number(),
  totalRowCount:        z.number(),
  changedRowCount:      z.number(),
  insertedRowCount:     z.number(),
  updatedRowCount:      z.number(),
  deletedRowCount:      z.number(),
  unchangedRowCount:    z.number(),
  cardRowCount:         z.number(),
  entityRowCount:       z.number(),
  localizationRowCount: z.number(),
  relationRowCount:     z.number(),
  publishedAt:          z.string(),
  pendingRowCount:      z.number().optional(),
});

export type PublishReport = z.infer<typeof publishReport>;

/** Stream-level gate state loaded from the remote serving database. */
interface RemotePublishGateState {
  registration: typeof PublishStreamRegistration.$inferSelect;
  ledger:       typeof PublishLedger.$inferSelect | null;
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
export const pinReadBatchSize = 5_000;
const remotePublishLeaseTtlMs = 5 * 60 * 1000;

/** Returns one active local batch for the same publish stream, regardless of operation kind. */
export async function findActiveStreamBatch(
  db: PublishDb,
  stream: Pick<PublishStreamIdentity, 'publishTarget' | 'environment' | 'publishType'>,
): Promise<typeof PublishBatch.$inferSelect | null> {
  return await db.select()
    .from(PublishBatch)
    .where(and(
      eq(PublishBatch.publishTarget, stream.publishTarget),
      eq(PublishBatch.environment, stream.environment),
      eq(PublishBatch.publishType, stream.publishType),
      inArray(PublishBatch.status, ['planning', 'applying']),
    ))
    .orderBy(desc(PublishBatch.createdAt))
    .then(rows => rows[0] ?? null);
}

export function hashJson(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}

export function chunkValues<T>(values: T[], size = writeBatchSize): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

/** Total row counts loaded once before chunked pin starts so the progress bar can advance deterministically. */
export async function loadPinRowCounts(db: PublishDb): Promise<PinCounts> {
  const [entityRowCount, localizationRowCount, relationRowCount, cardRowCount] = await Promise.all([
    db.$count(LocalEntity),
    db.$count(LocalEntityLocalization),
    db.$count(LocalEntityRelation),
    db.$count(LocalCard),
  ]);

  return {
    totalRowCount: entityRowCount + localizationRowCount + relationRowCount + cardRowCount,
    entityRowCount,
    localizationRowCount,
    relationRowCount,
    cardRowCount,
  };
}

/** One manifest line appended to the streamed pin digest in stable row order. */
export function buildManifestLine(state: PublishRowState): string {
  return `${state.tableName}\t${state.rowKey}\t${state.rowHash}\n`;
}

/** Remote publish gate rejects unregistered streams, fingerprint mismatches, and stale baselines. */
export async function assertRemotePublishGate(
  remoteDb: PublishDb,
  input: {
    publishTarget:         string;
    environment:           string;
    publishType:           string;
    targetFingerprint:     string;
    manifestHash:          string;
    previousManifestHash:  string | null;
    buildMax:              number;
    generationFingerprint: GenerationFingerprint;
    generationOrder:       GenerationOrder;
    leaseHolderId:         string;
  },
): Promise<RemotePublishGateState> {
  const registration = await remoteDb.select()
    .from(PublishStreamRegistration)
    .where(and(
      eq(PublishStreamRegistration.publishTarget, input.publishTarget),
      eq(PublishStreamRegistration.environment, input.environment),
      eq(PublishStreamRegistration.publishType, input.publishType),
    ))
    .then(rows => rows[0] ?? null);

  if (registration == null) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} is not registered for normal publish.`,
    );
  }

  if (!registration.normalPublishEnabled) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} does not allow normal publish.`,
    );
  }

  if (registration.targetFingerprint !== input.targetFingerprint) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} rejected target fingerprint ${input.targetFingerprint}.`,
    );
  }

  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + remotePublishLeaseTtlMs);

  const leased = await remoteDb.update(PublishStreamRegistration)
    .set({
      leaseHolderId: input.leaseHolderId,
      leaseExpiresAt,
      updatedAt:     now,
    })
    .where(and(
      eq(PublishStreamRegistration.publishTarget, input.publishTarget),
      eq(PublishStreamRegistration.environment, input.environment),
      eq(PublishStreamRegistration.publishType, input.publishType),
      or(
        isNull(PublishStreamRegistration.leaseHolderId),
        isNull(PublishStreamRegistration.leaseExpiresAt),
        lte(PublishStreamRegistration.leaseExpiresAt, now),
        eq(PublishStreamRegistration.leaseHolderId, input.leaseHolderId),
      ),
    ))
    .returning()
    .then(rows => rows[0] ?? null);

  if (leased == null) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} is already leased by another publish batch.`,
    );
  }

  const ledger = await remoteDb.select()
    .from(PublishLedger)
    .where(and(
      eq(PublishLedger.publishTarget, input.publishTarget),
      eq(PublishLedger.environment, input.environment),
      eq(PublishLedger.publishType, input.publishType),
    ))
    .then(rows => rows[0] ?? null);

  const remoteManifestHash = ledger?.manifestHash ?? null;

  if (remoteManifestHash != null && remoteManifestHash !== input.previousManifestHash) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} baseline changed: expected ${input.previousManifestHash}, got ${remoteManifestHash}.`,
    );
  }

  if (ledger != null && ledger.buildMax > input.buildMax) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} buildMax regressed: incoming ${input.buildMax}, remote ${ledger.buildMax}.`,
    );
  }

  if (ledger != null && ledger.generationOrder > input.generationOrder) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} generationOrder regressed: incoming ${input.generationOrder}, remote ${ledger.generationOrder}.`,
    );
  }

  if (
    ledger != null
    && ledger.generationOrder === input.generationOrder
    && ledger.generationFingerprint === input.generationFingerprint
    && ledger.buildMax === input.buildMax
    && ledger.manifestHash !== input.manifestHash
  ) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} manifest diverged on the same lineage: incoming ${input.manifestHash}, remote ${ledger.manifestHash}.`,
    );
  }

  return { registration: leased, ledger };
}

/** Release one ordinary publish lease after the batch reaches a terminal state in this process. */
export async function releaseRemotePublishLease(
  remoteDb: PublishDb,
  input: {
    publishTarget: string;
    environment:   string;
    publishType:   string;
    leaseHolderId: string;
  },
) {
  await remoteDb.update(PublishStreamRegistration)
    .set({
      leaseHolderId:  null,
      leaseExpiresAt: null,
      updatedAt:      new Date(),
    })
    .where(and(
      eq(PublishStreamRegistration.publishTarget, input.publishTarget),
      eq(PublishStreamRegistration.environment, input.environment),
      eq(PublishStreamRegistration.publishType, input.publishType),
      eq(PublishStreamRegistration.leaseHolderId, input.leaseHolderId),
    ));
}

/** Ensures one remote publish stream registration exists. No-op if already registered. */
export async function ensureRemotePublishRegistration(
  connectionString: string,
  input: {
    publishTarget:     string;
    environment:       string;
    publishType:       string;
    targetFingerprint: string;
  },
): Promise<void> {
  const remoteDb = createDb(connectionString);

  try {
    await remoteDb.insert(PublishStreamRegistration).values({
      publishTarget:        input.publishTarget,
      environment:          input.environment,
      publishType:          input.publishType,
      targetFingerprint:    input.targetFingerprint,
      normalPublishEnabled: true,
    })
      .onConflictDoUpdate({
        target: [
          PublishStreamRegistration.publishTarget,
          PublishStreamRegistration.environment,
          PublishStreamRegistration.publishType,
        ],
        set: {
          targetFingerprint:    input.targetFingerprint,
          normalPublishEnabled: true,
          updatedAt:            new Date(),
        },
      });
  } finally {
    await remoteDb.$client.end({ timeout: 1 });
  }
}

/** Extend one ordinary publish lease while the same batch keeps making progress. */
export async function renewRemotePublishLease(
  remoteDb: PublishDb,
  input: {
    publishTarget: string;
    environment:   string;
    publishType:   string;
    leaseHolderId: string;
  },
) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + remotePublishLeaseTtlMs);

  const renewed = await remoteDb.update(PublishStreamRegistration)
    .set({
      leaseExpiresAt,
      updatedAt: now,
    })
    .where(and(
      eq(PublishStreamRegistration.publishTarget, input.publishTarget),
      eq(PublishStreamRegistration.environment, input.environment),
      eq(PublishStreamRegistration.publishType, input.publishType),
      eq(PublishStreamRegistration.leaseHolderId, input.leaseHolderId),
      isNotNull(PublishStreamRegistration.leaseExpiresAt),
      gt(PublishStreamRegistration.leaseExpiresAt, now),
    ))
    .returning()
    .then(rows => rows[0] ?? null);

  if (renewed == null) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} lease could not be renewed for batch ${input.leaseHolderId}.`,
    );
  }
}

/** Build a deterministic JSON string from a row-key record with alphabetically sorted keys. */
function serializeRowKey(pk: Record<string, string>): string {
  const sorted: Record<string, string> = {};

  for (const key of Object.keys(pk).sort()) {
    sorted[key] = pk[key]!;
  }

  return JSON.stringify(sorted);
}

/** Parse a serialized row key back into a record. */
export function parseRowKey(serialized: string): Record<string, string> {
  return JSON.parse(serialized) as Record<string, string>;
}

/** Stable manifest projection for one entity row. */
function entityManifestValue(row: typeof LocalEntity.$inferSelect) {
  return {
    cardId:            row.cardId,
    version:           row.version,
    revisionHash:      row.revisionHash,
    dbfId:             row.dbfId,
    legacyPayload:     row.legacyPayload,
    set:               row.set,
    classes:           row.classes,
    type:              row.type,
    cost:              row.cost,
    attack:            row.attack,
    health:            row.health,
    durability:        row.durability,
    armor:             row.armor,
    rune:              row.rune,
    race:              row.race,
    spellSchool:       row.spellSchool,
    questType:         row.questType,
    questProgress:     row.questProgress,
    questPart:         row.questPart,
    heroPower:         row.heroPower,
    techLevel:         row.techLevel,
    inBobsTavern:      row.inBobsTavern,
    tripleCard:        row.tripleCard,
    raceBucket:        row.raceBucket,
    armorBucket:       row.armorBucket,
    buddy:             row.buddy,
    bannedRace:        row.bannedRace,
    mercenaryRole:     row.mercenaryRole,
    mercenaryFaction:  row.mercenaryFaction,
    colddown:          row.colddown,
    collectible:       row.collectible,
    elite:             row.elite,
    rarity:            row.rarity,
    artist:            row.artist,
    overrideWatermark: row.overrideWatermark,
    faction:           row.faction,
    mechanics:         row.mechanics,
    referencedTags:    row.referencedTags,
    textBuilderType:   row.textBuilderType,
    changeType:        row.changeType,
    isLatest:          row.isLatest,
  };
}

/** Stable manifest projection for one localization row. */
function localizationManifestValue(row: typeof LocalEntityLocalization.$inferSelect) {
  return {
    cardId:           row.cardId,
    version:          row.version,
    lang:             row.lang,
    revisionHash:     row.revisionHash,
    localizationHash: row.localizationHash,
    renderHash:       row.renderHash,
    renderModel:      row.renderModel,
    isLatest:         row.isLatest,
    name:             row.name,
    text:             row.text,
    richText:         row.richText,
    displayText:      row.displayText,
    targetText:       row.targetText,
    textInPlay:       row.textInPlay,
    howToEarn:        row.howToEarn,
    howToEarnGolden:  row.howToEarnGolden,
    flavorText:       row.flavorText,
    locChangeType:    row.locChangeType,
  };
}

/** Stable manifest projection for one relation row. */
function relationManifestValue(row: typeof LocalEntityRelation.$inferSelect) {
  return {
    sourceId:           row.sourceId,
    sourceRevisionHash: row.sourceRevisionHash,
    relation:           row.relation,
    targetId:           row.targetId,
    version:            row.version,
    isLatest:           row.isLatest,
  };
}

/** Stable manifest projection for one card row. */
function cardManifestValue(row: typeof LocalCard.$inferSelect) {
  return {
    cardId:     row.cardId,
    legalities: row.legalities,
  };
}

function cardsRowKey(row: typeof LocalCard.$inferSelect): string {
  return serializeRowKey({ cardId: row.cardId });
}

function entitiesRowKey(row: typeof LocalEntity.$inferSelect): string {
  return serializeRowKey({
    cardId:       row.cardId,
    revisionHash: row.revisionHash,
  });
}

function localizationsRowKey(row: typeof LocalEntityLocalization.$inferSelect): string {
  return serializeRowKey({
    cardId:           row.cardId,
    lang:             row.lang,
    localizationHash: row.localizationHash,
    revisionHash:     row.revisionHash,
  });
}

function relationsRowKey(row: typeof LocalEntityRelation.$inferSelect): string {
  return serializeRowKey({
    relation:           row.relation,
    sourceId:           row.sourceId,
    sourceRevisionHash: row.sourceRevisionHash,
    targetId:           row.targetId,
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

/** Stable manifest projection for one patch row. */
function patchManifestValue(row: typeof LocalPatch.$inferSelect) {
  return {
    buildNumber: row.buildNumber,
    name:        row.name,
    shortName:   row.shortName,
    hash:        row.hash,
    isLatest:    row.isLatest,
    releaseDate: row.releaseDate,
    expansion:   row.expansion,
  };
}

function patchesRowKey(row: typeof LocalPatch.$inferSelect): string {
  return serializeRowKey({ buildNumber: String(row.buildNumber) });
}

function patchRowHash(row: typeof LocalPatch.$inferSelect): string {
  return hashJson(patchManifestValue(row));
}

/** Current accepted row hashes loaded directly from the row baseline table. */
export async function loadBaselineRowHashes(
  db: PublishDb,
  stream: PublishStream,
): Promise<{
  baseline:          typeof PublishBaseline.$inferSelect | null;
  baselineRowHashes: Map<TableName, Map<string, string>>;
}> {
  const rowBaselines = await db.select()
    .from(PublishRowBaseline)
    .where(and(
      eq(PublishRowBaseline.publishTarget, stream.publishTarget),
      eq(PublishRowBaseline.environment, stream.environment),
      eq(PublishRowBaseline.publishType, stream.publishType),
    ));

  const baselineRowHashes = new Map<TableName, Map<string, string>>();

  for (const row of rowBaselines) {
    const tableName = row.tableName as TableName;

    if (!baselineRowHashes.has(tableName)) {
      baselineRowHashes.set(tableName, new Map());
    }

    baselineRowHashes.get(tableName)!.set(row.rowKey, row.rowHash);
  }

  const baseline = await db.select()
    .from(PublishBaseline)
    .where(and(
      eq(PublishBaseline.publishTarget, stream.publishTarget),
      eq(PublishBaseline.environment, stream.environment),
      eq(PublishBaseline.publishType, stream.publishType),
    ))
    .then(rows => rows[0] ?? null);

  return { baseline, baselineRowHashes };
}

/** Source-tag and build range mapped from the current latest local entity versions. */
export async function derivePublishDatasetRange(
  _db: PublishDb,
  allEntityVersions: number[][],
  previousRange?: PublishDatasetRange | null,
): Promise<PublishDatasetRange> {
  const builds = [...new Set(allEntityVersions.flat())].sort((left, right) => left - right);

  if (builds.length === 0) {
    if (previousRange != null) {
      return previousRange;
    }
    throw new Error('Local publish snapshot does not include any Hearthstone build numbers.');
  }

  const buildMin = builds[0]!;
  const buildMax = builds[builds.length - 1]!;

  if (previousRange != null) {
    return {
      buildMin: Math.min(previousRange.buildMin, buildMin),
      buildMax: Math.max(previousRange.buildMax, buildMax),
    };
  }

  return { buildMin, buildMax };
}

/** Batch-row plans and aggregate counts derived from current states and baseline row hashes. */
function buildBatchRowPlans(
  currentStates: PublishRowState[],
  baselineRowHashes: Map<TableName, Map<string, string>>,
): {
  plans:        PublishBatchRowPlan[];
  counts:       PublishBatchCounts;
  manifestHash: string;
} {
  const currentByTable = new Map<TableName, Map<string, string>>();

  for (const state of currentStates) {
    if (!currentByTable.has(state.tableName)) {
      currentByTable.set(state.tableName, new Map());
    }

    currentByTable.get(state.tableName)!.set(state.rowKey, state.rowHash);
  }

  const allTables = new Set<TableName>([...currentByTable.keys(), ...baselineRowHashes.keys()]);
  const plans: PublishBatchRowPlan[] = [];
  const counts: PublishBatchCounts = {
    totalRowCount:        0,
    changedRowCount:      0,
    insertedRowCount:     0,
    updatedRowCount:      0,
    deletedRowCount:      0,
    unchangedRowCount:    0,
    cardRowCount:         0,
    entityRowCount:       0,
    localizationRowCount: 0,
    relationRowCount:     0,
  };

  for (const tableName of allTables) {
    const current = currentByTable.get(tableName) ?? new Map();
    const previousTableHashes = baselineRowHashes.get(tableName) ?? new Map();
    const allPks = new Set([...current.keys(), ...previousTableHashes.keys()]);

    for (const rowKey of allPks) {
      const curHash = current.get(rowKey) ?? null;
      const prevHash = previousTableHashes.get(rowKey) ?? null;

      if (curHash != null && prevHash == null) {
        counts.insertedRowCount += 1;
        counts.changedRowCount += 1;
        plans.push({ tableName, rowKey, rowHash: curHash, previousRowHash: null, action: 'insert' });
      } else if (curHash != null && prevHash != null && curHash === prevHash) {
        counts.unchangedRowCount += 1;
        plans.push({ tableName, rowKey, rowHash: curHash, previousRowHash: prevHash, action: 'unchanged' });
      } else if (curHash != null && prevHash != null) {
        counts.updatedRowCount += 1;
        counts.changedRowCount += 1;
        plans.push({ tableName, rowKey, rowHash: curHash, previousRowHash: prevHash, action: 'update' });
      } else if (curHash == null && prevHash != null) {
        counts.deletedRowCount += 1;
        counts.changedRowCount += 1;
        plans.push({ tableName, rowKey, rowHash: '', previousRowHash: prevHash, action: 'delete' });
      }

      switch (tableName) {
      case 'cards':
        counts.cardRowCount += 1;
        break;
      case 'entities':
        counts.entityRowCount += 1;
        break;
      case 'entity_localizations':
        counts.localizationRowCount += 1;
        break;
      case 'entity_relations':
        counts.relationRowCount += 1;
        break;
      }
    }
  }

  counts.totalRowCount = plans.length;

  plans.sort((a, b) => {
    const cmp = a.tableName.localeCompare(b.tableName);

    return cmp !== 0 ? cmp : a.rowKey.localeCompare(b.rowKey);
  });

  const manifestHash = hashJson(plans
    .filter(p => p.action !== 'delete')
    .map(p => ({
      tableName: p.tableName,
      rowKey:    p.rowKey,
      rowHash:   p.rowHash,
    })));

  return { plans, counts, manifestHash };
}

/** Stopped batch state persisted after a cooperative stop request interrupts execution. */
async function finalizePublishBatchStopped(
  db: PublishDb,
  batchId: string,
  message: string,
): Promise<void> {
  const now = new Date();

  await db.update(PublishBatch)
    .set({
      status:      'stopped',
      error:       message,
      completedAt: now,
      updatedAt:   now,
    })
    .where(eq(PublishBatch.id, batchId));
}

/** Cancels one residual local batch when no in-memory publish job is still executing it. */
export async function cancelIncompletePublishBatch(input: {
  batchId:        string;
  publishTarget?: string;
  environment?:   string;
}): Promise<PublishReport> {
  const target = resolvePublishTargetSelector(input);
  const localDb = getLocalDb();
  const batch = await localDb.select()
    .from(PublishBatch)
    .where(and(
      eq(PublishBatch.id, input.batchId),
      eq(PublishBatch.publishTarget, target.publishTarget),
      eq(PublishBatch.environment, target.environment),
    ))
    .then(rows => rows[0] ?? null);

  if (!batch) {
    throw new Error(`Publish batch ${input.batchId} not found for ${target.publishTarget}/${target.environment}.`);
  }

  if (batch.status !== 'planning' && batch.status !== 'applying') {
    throw new Error(`Publish batch ${input.batchId} is already ${batch.status} and cannot be canceled.`);
  }

  const currentJob = getCurrentPublishJob();

  if (currentJob?.batchId === batch.id) {
    throw new Error(`Publish batch ${batch.id} is still running in the desktop runtime. Stop the active job first.`);
  }

  const message = '批次已由用户从数据库残留状态中取消。';
  await finalizePublishBatchStopped(localDb, batch.id, message);

  const stoppedBatch = await localDb.select()
    .from(PublishBatch)
    .where(eq(PublishBatch.id, batch.id))
    .then(rows => rows[0] ?? null);

  if (!stoppedBatch) {
    throw new Error(`Publish batch ${batch.id} disappeared after cancellation.`);
  }

  return buildPublishReport(stoppedBatch, stoppedBatch.completedAt ?? stoppedBatch.updatedAt);
}

/** Publish ledger upsert executed inside the remote publish transaction. */
export async function upsertRemotePublishLedger(
  tx: PublishDbTx,
  input: {
    batchId:               string;
    publishTarget:         string;
    environment:           string;
    targetFingerprint:     string;
    publishType:           string;
    range:                 PublishDatasetRange;
    generationFingerprint: GenerationFingerprint;
    generationOrder:       GenerationOrder;
    counts:                PublishBatchCounts;
    manifestHash:          string;
    publishedAt:           Date;
  },
): Promise<void> {
  await tx.insert(PublishLedger).values({
    publishTarget:         input.publishTarget,
    environment:           input.environment,
    publishType:           input.publishType,
    targetFingerprint:     input.targetFingerprint,
    batchId:               input.batchId,
    buildMin:              input.range.buildMin,
    buildMax:              input.range.buildMax,
    generationFingerprint: input.generationFingerprint,
    generationOrder:       input.generationOrder,
    manifestHash:          input.manifestHash,
    totalRowCount:         input.counts.totalRowCount,
    changedRowCount:       input.counts.changedRowCount,
    publishedAt:           input.publishedAt,
    createdAt:             input.publishedAt,
    updatedAt:             input.publishedAt,
  })
    .onConflictDoUpdate({
      target: [
        PublishLedger.publishTarget,
        PublishLedger.environment,
        PublishLedger.publishType,
      ],
      set: {
        environment:           input.environment,
        publishType:           input.publishType,
        targetFingerprint:     input.targetFingerprint,
        batchId:               input.batchId,
        buildMin:              input.range.buildMin,
        buildMax:              input.range.buildMax,
        generationFingerprint: input.generationFingerprint,
        generationOrder:       input.generationOrder,
        manifestHash:          input.manifestHash,
        totalRowCount:         input.counts.totalRowCount,
        changedRowCount:       input.counts.changedRowCount,
        publishedAt:           input.publishedAt,
        updatedAt:             input.publishedAt,
      },
    });
}

/** Delete one row from the remote table using the parsed PK. */
export async function deleteRemoteRow(
  tx: PublishDbTx,
  tableName: TableName,
  rowKey: Record<string, string>,
): Promise<void> {
  switch (tableName) {
  case 'cards':
    await tx.delete(RemoteBaseCard).where(eq(RemoteBaseCard.cardId, rowKey.cardId!));
    return;
  case 'entities':
    await tx.delete(RemoteBaseEntity).where(and(
      eq(RemoteBaseEntity.cardId, rowKey.cardId!),
      eq(RemoteBaseEntity.revisionHash, rowKey.revisionHash!),
    ));
    return;
  case 'entity_localizations':
    await tx.delete(RemoteBaseEntityLocalization).where(and(
      eq(RemoteBaseEntityLocalization.cardId, rowKey.cardId!),
      eq(RemoteBaseEntityLocalization.lang, rowKey.lang! as Locale),
      eq(RemoteBaseEntityLocalization.revisionHash, rowKey.revisionHash!),
      eq(RemoteBaseEntityLocalization.localizationHash, rowKey.localizationHash!),
    ));
    return;
  case 'entity_relations':
    await tx.delete(RemoteBaseEntityRelation).where(and(
      eq(RemoteBaseEntityRelation.sourceId, rowKey.sourceId!),
      eq(RemoteBaseEntityRelation.sourceRevisionHash, rowKey.sourceRevisionHash!),
      eq(RemoteBaseEntityRelation.relation, rowKey.relation!),
      eq(RemoteBaseEntityRelation.targetId, rowKey.targetId!),
    ));
    return;
  case 'patches':
    await tx.delete(RemotePatch).where(eq(RemotePatch.buildNumber, Number(rowKey.buildNumber!)));
    return;
  }
}

/** Insert one row into the remote table. For cards, uses upsert semantics. */
export async function insertRemoteRow(
  tx: PublishDbTx,
  tableName: TableName,
  row: unknown,
  action: 'insert' | 'update',
): Promise<void> {
  if (tableName === 'cards') {
    const cardRow = row as typeof LocalCard.$inferSelect;

    if (action === 'update') {
      await tx.insert(RemoteBaseCard).values({
        cardId:     cardRow.cardId,
        legalities: cardRow.legalities,
      })
        .onConflictDoUpdate({
          target: RemoteBaseCard.cardId,
          set:    { legalities: cardRow.legalities },
        });
    } else {
      await tx.insert(RemoteBaseCard).values({
        cardId:     cardRow.cardId,
        legalities: cardRow.legalities,
      })
        .onConflictDoUpdate({
          target: RemoteBaseCard.cardId,
          set:    { legalities: cardRow.legalities },
        });
    }

    return;
  }

  const now = new Date();

  if (tableName === 'entities') {
    const entityRow = row as typeof LocalEntity.$inferSelect;

    await tx.insert(RemoteBaseEntity).values({ ...entityRow, updatedAt: now })
      .onConflictDoUpdate({
        target: [RemoteBaseEntity.cardId, RemoteBaseEntity.revisionHash],
        set:    { ...entityRow, updatedAt: now },
      });
    return;
  }

  if (tableName === 'entity_localizations') {
    const locRow = row as typeof LocalEntityLocalization.$inferSelect;

    await tx.insert(RemoteBaseEntityLocalization).values({ ...locRow, updatedAt: now })
      .onConflictDoUpdate({
        target: [RemoteBaseEntityLocalization.cardId, RemoteBaseEntityLocalization.lang, RemoteBaseEntityLocalization.revisionHash, RemoteBaseEntityLocalization.localizationHash],
        set:    { ...locRow, updatedAt: now },
      });
    return;
  }

  if (tableName === 'patches') {
    const patchRow = row as typeof LocalPatch.$inferSelect;

    await tx.insert(RemotePatch).values({ ...patchRow })
      .onConflictDoUpdate({
        target: RemotePatch.buildNumber,
        set:    { ...patchRow },
      });
    return;
  }

  const relRow = row as typeof LocalEntityRelation.$inferSelect;

  await tx.insert(RemoteBaseEntityRelation).values({ ...relRow, updatedAt: now })
    .onConflictDoUpdate({
      target: [RemoteBaseEntityRelation.sourceId, RemoteBaseEntityRelation.sourceRevisionHash, RemoteBaseEntityRelation.relation, RemoteBaseEntityRelation.targetId],
      set:    { ...relRow, updatedAt: now },
    });
}

/** Returns the partition key for one row based on its table type. */
export function rowKeyOf(row: any, tableName: string): string {
  switch (tableName) {
  case 'cards': return cardsRowKey(row);
  case 'entities': return entitiesRowKey(row);
  case 'entity_localizations': return localizationsRowKey(row);
  case 'entity_relations': return relationsRowKey(row);
  case 'patches': return patchesRowKey(row);
  default: throw new Error(`Unknown table: ${tableName}`);
  }
}

/** Computes the row hash for one row based on its table type. */
export function rowHashOf(row: any, tableName: string): string {
  switch (tableName) {
  case 'cards': return cardRowHash(row);
  case 'entities': return entityRowHash(row);
  case 'entity_localizations': return localizationRowHash(row);
  case 'entity_relations': return relationRowHash(row);
  case 'patches': return patchRowHash(row);
  default: throw new Error(`Unknown table: ${tableName}`);
  }
}

/** Loads one chunk of row data and computes hashes. Returns Map<tableName, Map<rowKey, hash>>. */
export async function loadChunkDataAndHash(
  db: PublishDb,
  byTable: Map<TableName, string[]>,
  builds: Set<number>,
): Promise<Map<TableName, Map<string, string>>> {
  const result = new Map<TableName, Map<string, string>>();
  for (const tableName of byTable.keys()) {
    const rowKeys = byTable.get(tableName);
    if (!rowKeys || rowKeys.length === 0) continue;

    const rows = await loadRowDataChunk(db, tableName, rowKeys);
    const hashes = new Map<string, string>();
    for (const rowKey of rowKeys) {
      const row = rows.get(rowKey);
      if (row != null) {
        const hash = rowHashOf(row, tableName);
        hashes.set(rowKey, hash);
        if (tableName === 'entities') {
          const versions = (row as typeof LocalEntity.$inferSelect).version;
          if (versions) versions.forEach(v => builds.add(v));
        }
      } else {
        hashes.set(rowKey, '');
      }
    }
    result.set(tableName, hashes);
  }
  return result;
}

/** Load one chunk of local row data keyed by rowKey for a given table. */
export async function loadRowDataChunk(
  db: PublishDb,
  tableName: TableName,
  rowKeys: string[],
): Promise<Map<string, unknown>> {
  const result = new Map<string, unknown>();

  if (rowKeys.length === 0) return result;

  switch (tableName) {
  case 'cards': {
    const cardIds = rowKeys.map(key => parseRowKey(key).cardId!);
    const rows = await db.select().from(LocalCard).where(inArray(LocalCard.cardId, cardIds));

    for (const row of rows) {
      result.set(cardsRowKey(row), row);
    }

    break;
  }
  case 'entities': {
    const keys = rowKeys.map(key => parseRowKey(key));
    const cardIds = [...new Set(keys.map(p => p.cardId!))];

    if (cardIds.length === 0) break;

    const revisionHashes = [...new Set(keys.map(p => p.revisionHash!))];
    const rows = await db.select().from(LocalEntity)
      .where(and(
        inArray(LocalEntity.cardId, cardIds),
        inArray(LocalEntity.revisionHash, revisionHashes),
      ));

    for (const row of rows) {
      result.set(entitiesRowKey(row), row);
    }

    break;
  }
  case 'entity_localizations': {
    const keys = rowKeys.map(key => parseRowKey(key));
    const cardIds = [...new Set(keys.map(p => p.cardId!))];

    if (cardIds.length === 0) break;

    const langs = [...new Set(keys.map(p => p.lang! as Locale))];
    const revisionHashes = [...new Set(keys.map(p => p.revisionHash!))];
    const localizationHashes = [...new Set(keys.map(p => p.localizationHash!))];

    const rows = await db.select().from(LocalEntityLocalization)
      .where(and(
        inArray(LocalEntityLocalization.cardId, cardIds),
        inArray(LocalEntityLocalization.lang, langs),
        inArray(LocalEntityLocalization.revisionHash, revisionHashes),
        inArray(LocalEntityLocalization.localizationHash, localizationHashes),
      ));

    for (const row of rows) {
      result.set(localizationsRowKey(row), row);
    }

    break;
  }
  case 'entity_relations': {
    const keys = rowKeys.map(key => parseRowKey(key));
    const sourceIds = [...new Set(keys.map(p => p.sourceId!))];

    if (sourceIds.length === 0) break;

    const sourceRevisionHashes = [...new Set(keys.map(p => p.sourceRevisionHash!))];
    const relations = [...new Set(keys.map(p => p.relation!))];
    const targetIds = [...new Set(keys.map(p => p.targetId!))];

    const rows = await db.select().from(LocalEntityRelation)
      .where(and(
        inArray(LocalEntityRelation.sourceId, sourceIds),
        inArray(LocalEntityRelation.sourceRevisionHash, sourceRevisionHashes),
        inArray(LocalEntityRelation.relation, relations),
        inArray(LocalEntityRelation.targetId, targetIds),
      ));

    for (const row of rows) {
      result.set(relationsRowKey(row), row);
    }

    break;
  }
  case 'patches': {
    const buildNumbers = rowKeys.map(key => Number(parseRowKey(key).buildNumber!));
    const rows = await db.select().from(LocalPatch).where(inArray(LocalPatch.buildNumber, buildNumbers));

    for (const row of rows) {
      result.set(patchesRowKey(row), row);
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
    batchId:              batch.id,
    publishTarget:        batch.publishTarget,
    environment:          batch.environment,
    targetFingerprint:    batch.targetFingerprint,
    publishType:          batch.publishType,
    operationKind:        batch.operationKind,
    status:               batch.status,
    manifestHash:         batch.manifestHash,
    previousManifestHash: batch.previousManifestHash ?? null,
    buildMin:             batch.buildMin,
    buildMax:             batch.buildMax,
    totalRowCount:        batch.totalRowCount,
    changedRowCount:      batch.changedRowCount,
    insertedRowCount:     batch.insertedRowCount,
    updatedRowCount:      batch.updatedRowCount,
    deletedRowCount:      batch.deletedRowCount,
    unchangedRowCount:    batch.unchangedRowCount,
    cardRowCount:         batch.cardRowCount,
    entityRowCount:       batch.entityRowCount,
    localizationRowCount: batch.localizationRowCount,
    relationRowCount:     batch.relationRowCount,
    publishedAt:          at,
  };
}

/** Execute phase: apply one publish batch to remote in chunked transactions.
 *
 * Each chunk runs in its own remote transaction. On success, the corresponding
 * publish_batch_rows are marked applied. If the process crashes mid-execution,
 * re-calling this function will skip already-applied rows and resume from the
 * first pending row.
 */

/** Lists all publish batches for the current target, newest first. */
export async function listPublishBatches(options?: {
  publishTarget?: string;
  environment?:   string;
}): Promise<PublishReport[]> {
  const target = resolvePublishTargetSelector(options);
  const localDb = getLocalDb();

  const batches = await localDb.select()
    .from(PublishBatch)
    .where(and(
      eq(PublishBatch.publishTarget, target.publishTarget),
      eq(PublishBatch.environment, target.environment),
    ))
    .orderBy(desc(PublishBatch.createdAt))
    .limit(50);

  return batches.map(b => buildPublishReport(b, b.completedAt ?? b.createdAt));
}

/** Checks whether a publish job is currently running in this server process. */
export async function getIncompletePublishBatch(options?: {
  publishTarget?: string;
  environment?:   string;
}): Promise<PublishReport | null> {
  const job = getCurrentPublishJob();

  if (!job) return null;

  const localDb = getLocalDb();
  const batch = await localDb.select()
    .from(PublishBatch)
    .where(eq(PublishBatch.id, job.batchId))
    .then(rows => rows[0] ?? null);

  if (!batch) return null;

  const target = resolvePublishTargetSelector(options);

  if (batch.publishTarget !== target.publishTarget || batch.environment !== target.environment) {
    return null;
  }

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
  assertRemotePublishGate,
  renewRemotePublishLease,
  buildBatchRowPlans,
  loadRowDataChunk,
  serializeRowKey,
  parseRowKey,
  cardsRowKey,
  entitiesRowKey,
  localizationsRowKey,
  relationsRowKey,
  cardRowHash,
  entityRowHash,
  localizationRowHash,
  relationRowHash,
};

export const singleCardPublishReport = z.object({
  cardId:            z.string(),
  entityCount:       z.number(),
  localizationCount: z.number(),
  relationCount:     z.number(),
  cardCount:         z.number(),
});

export type SingleCardPublishReport = z.infer<typeof singleCardPublishReport>;

/** Publishes a single card from local projection tables to the remote target. */
export async function publishSingleCard(
  cardId: string,
  options?: {
    publishTarget?: string;
    environment?:   string;
  },
): Promise<SingleCardPublishReport> {
  const target = resolvePublishTargetSelector(options);
  const localDb = getLocalDb();
  const remoteDb = createDb(target.connectionString);

  try {
    const entities = await localDb.select().from(LocalEntity).where(eq(LocalEntity.cardId, cardId));
    const localizations = await localDb.select().from(LocalEntityLocalization).where(eq(LocalEntityLocalization.cardId, cardId));
    const relations = await localDb.select().from(LocalEntityRelation).where(eq(LocalEntityRelation.sourceId, cardId));
    const cards = await localDb.select().from(LocalCard).where(eq(LocalCard.cardId, cardId));

    await remoteDb.transaction(async tx => {
      await tx.delete(RemoteBaseEntity).where(eq(RemoteBaseEntity.cardId, cardId));
      for (const row of entities) {
        await tx.insert(RemoteBaseEntity).values(row);
      }

      await tx.delete(RemoteBaseEntityLocalization).where(eq(RemoteBaseEntityLocalization.cardId, cardId));
      for (const row of localizations) {
        await tx.insert(RemoteBaseEntityLocalization).values(row);
      }

      await tx.delete(RemoteBaseEntityRelation).where(eq(RemoteBaseEntityRelation.sourceId, cardId));
      for (const row of relations) {
        await tx.insert(RemoteBaseEntityRelation).values(row);
      }

      if (cards.length > 0) {
        const card = cards[0]!;
        await tx.insert(RemoteBaseCard).values(card)
          .onConflictDoUpdate({
            target: RemoteBaseCard.cardId,
            set:    { legalities: card.legalities },
          });
      }
    });

    return { cardId, entityCount: entities.length, localizationCount: localizations.length, relationCount: relations.length, cardCount: cards.length };
  } finally {
    await remoteDb.$client.end({ timeout: 1 });
  }
}
