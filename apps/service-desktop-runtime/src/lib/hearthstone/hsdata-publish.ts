import { randomUUID } from 'node:crypto';

import { and, asc, count, desc, eq, gt, inArray, isNotNull, lte, ne, or, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  publishOperationKind as publishOperationKindSchema,
  type PublishOperationKind,
  type PublishStream,
} from '@tcg-cards/model/src/game-data-sync';
import type { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

import { createDb } from '@tcg-cards/db';
import {
  Card as LocalCard,
  Entity as LocalEntity,
  EntityLocalization as LocalEntityLocalization,
  EntityRelation as LocalEntityRelation,
  PublishBaseline,
  PublishBatch,
  PublishBatchRow,
  PublishRowBaseline,
  PublishRowChangeLog,
  SourceVersion,
} from '@tcg-cards/db/schema/local/hearthstone';
import { TaskRun } from '@tcg-cards/db/schema/local/task';
import {
  Card as RemoteCard,
  Entity as RemoteEntity,
  EntityLocalization as RemoteEntityLocalization,
  EntityRelation as RemoteEntityRelation,
} from '@tcg-cards/db/schema/remote/hearthstone';
import {
  PublishLedger,
  PublishStreamRegistration,
} from '@tcg-cards/db/schema/remote/publish';

import {
  publishCardDataGeneration,
  type PublishGeneration,
} from './publish-generation';
import { getLocalDb } from './hsdata-local-db';
import { getCurrentPublishJob } from './hsdata-publish-progress';
import {
  requireHearthstonePublishTarget,
  requireHearthstonePublishTargetByIdentity,
} from './hsdata-publish-target';
import {
  getPublishJobController,
  PublishJobInterruptedError,
} from './hsdata-publish-progress';

export type PublishDb = ReturnType<typeof createDb>;

type PublishDbTx = Parameters<Parameters<PublishDb['transaction']>[0]>[0];

export type TableName = 'cards' | 'entities' | 'entity_localizations' | 'entity_relations';

interface PublishRowState {
  tableName: TableName;
  rowKey: string;
  rowHash: string;
}

interface CurrentRowData {
  cards: Map<string, typeof LocalCard.$inferSelect>;
  entities: Map<string, typeof LocalEntity.$inferSelect>;
  localizations: Map<string, typeof LocalEntityLocalization.$inferSelect>;
  relations: Map<string, typeof LocalEntityRelation.$inferSelect>;
}

export interface ReanchorCounts {
  totalRowCount: number;
  cardRowCount: number;
  entityRowCount: number;
  localizationRowCount: number;
  relationRowCount: number;
}

interface PublishBatchRowPlan {
  tableName: TableName;
  rowKey: string;
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

type GenerationFingerprint = PublishGeneration['fingerprint'];
type GenerationOrder = PublishGeneration['order'];

interface PublishTargetSelector {
  publishTarget?: string;
  environment?: string;
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
  publishTarget: z.string(),
  environment: z.string(),
  targetFingerprint: z.string(),
  publishType: z.string(),
  operationKind: z.string(),
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
  rowKey: string | null;
  message: string;
}

/** Stream-level gate state loaded from the remote serving database. */
interface RemotePublishGateState {
  registration: typeof PublishStreamRegistration.$inferSelect;
  ledger: typeof PublishLedger.$inferSelect | null;
}

/** Lease acquisition result for one ordinary publish batch. */
interface RemotePublishLease {
  holderId: string;
  expiresAt: Date;
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
export const reanchorReadBatchSize = 5_000;
const remotePublishLeaseTtlMs = 5 * 60 * 1000;

/** Returns one active local batch for the same publish stream, regardless of operation kind. */
async function findActiveStreamBatch(
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

async function closePublishDb(db: PublishDb) {
  await db.$client.end({ timeout: 1 });
}

export function hashJson(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function chunkValues<T>(values: T[], size = writeBatchSize): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

/** Total row counts loaded once before chunked reanchor starts so the progress bar can advance deterministically. */
export async function loadReanchorRowCounts(db: PublishDb): Promise<ReanchorCounts> {
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

/** One manifest line appended to the streamed reanchor digest in stable row order. */
export function buildManifestLine(state: PublishRowState): string {
  return `${state.tableName}\t${state.rowKey}\t${state.rowHash}\n`;
}

/** Writes one streamed reanchor baseline by scanning local projection tables in stable chunks. */
export async function rebuildReanchorBaseline(
  db: PublishDb,
  input: {
    batchId: string;
    publishTarget: string;
    environment: string;
    publishType: string;
    previousRange: PublishDatasetRange | null;
    publishedAt: Date;
    onProgress?: StepProgress;
  },
): Promise<{
    counts: PublishBatchCounts;
    range: PublishDatasetRange;
    manifestHash: string;
  }> {
  const countsByTable = await loadReanchorRowCounts(db);
  const totalRowCount = countsByTable.totalRowCount;
  const manifest = new Bun.CryptoHasher('sha256');
  const collectedBuilds = new Set<number>();
  let completedRowCount = 0;

  const updateProgress = (message: string) => {
    input.onProgress?.({
      phase: 'loading_snapshots',
      message,
      completed: completedRowCount,
      total: totalRowCount,
    });
  };

  const checkJobControl = () => {
    const controller = getPublishJobController();

    if (controller?.shouldStop) {
      throw new PublishJobInterruptedError('stopped', '发布已停止');
    }
  };

  await db.delete(PublishRowBaseline)
    .where(and(
      eq(PublishRowBaseline.publishTarget, input.publishTarget),
      eq(PublishRowBaseline.environment, input.environment),
      eq(PublishRowBaseline.publishType, input.publishType),
    ));

  updateProgress('正在重建本地 baseline...');

  async function processChunks<T extends typeof LocalEntity.$inferSelect | typeof LocalEntityLocalization.$inferSelect | typeof LocalEntityRelation.$inferSelect | typeof LocalCard.$inferSelect>(
    tableName: TableName,
    loadChunk: (cursor: T | null) => Promise<T[]>,
    getRowKey: (row: T) => string,
    getRowHash: (row: T) => string,
    collectBuilds?: (row: T) => void,
  ) {
    let cursor: T | null = null;

    while (true) {
      checkJobControl();
      const rows = await loadChunk(cursor);

      if (rows.length === 0) {
        break;
      }

      const baselineRows = rows.map((row) => {
        const rowKey = getRowKey(row);
        const rowHash = getRowHash(row);

        manifest.update(buildManifestLine({ tableName, rowKey, rowHash }));
        collectBuilds?.(row);

        return {
          publishTarget: input.publishTarget,
          environment: input.environment,
          publishType: input.publishType,
          tableName,
          rowKey,
          rowHash,
          sourceBatchId: input.batchId,
          publishedAt: input.publishedAt,
          createdAt: input.publishedAt,
          updatedAt: input.publishedAt,
        };
      });

      for (const chunk of chunkValues(baselineRows)) {
        checkJobControl();
        await db.insert(PublishRowBaseline).values(chunk);
      }

      completedRowCount += rows.length;
      updateProgress(`正在重建 ${tableName} baseline...`);
      cursor = rows[rows.length - 1] ?? null;
    }
  }

  await processChunks(
    'entities',
    cursor => db.select()
      .from(LocalEntity)
      .where(cursor == null
        ? undefined
        : or(
            gt(LocalEntity.cardId, cursor.cardId),
            and(
              eq(LocalEntity.cardId, cursor.cardId),
              gt(LocalEntity.revisionHash, cursor.revisionHash),
            ),
          ))
      .orderBy(asc(LocalEntity.cardId), asc(LocalEntity.revisionHash))
      .limit(reanchorReadBatchSize),
    entitiesRowKey,
    entityRowHash,
    row => {
      for (const build of row.version) {
        collectedBuilds.add(build);
      }
    },
  );

  await processChunks(
    'entity_localizations',
    cursor => db.select()
      .from(LocalEntityLocalization)
      .where(cursor == null
        ? undefined
        : or(
            gt(LocalEntityLocalization.cardId, cursor.cardId),
            and(
              eq(LocalEntityLocalization.cardId, cursor.cardId),
              gt(LocalEntityLocalization.lang, cursor.lang),
            ),
            and(
              eq(LocalEntityLocalization.cardId, cursor.cardId),
              eq(LocalEntityLocalization.lang, cursor.lang),
              gt(LocalEntityLocalization.revisionHash, cursor.revisionHash),
            ),
            and(
              eq(LocalEntityLocalization.cardId, cursor.cardId),
              eq(LocalEntityLocalization.lang, cursor.lang),
              eq(LocalEntityLocalization.revisionHash, cursor.revisionHash),
              gt(LocalEntityLocalization.localizationHash, cursor.localizationHash),
            ),
          ))
      .orderBy(
        asc(LocalEntityLocalization.cardId),
        asc(LocalEntityLocalization.lang),
        asc(LocalEntityLocalization.revisionHash),
        asc(LocalEntityLocalization.localizationHash),
      )
      .limit(reanchorReadBatchSize),
    localizationsRowKey,
    localizationRowHash,
  );

  await processChunks(
    'entity_relations',
    cursor => db.select()
      .from(LocalEntityRelation)
      .where(cursor == null
        ? undefined
        : or(
            gt(LocalEntityRelation.sourceId, cursor.sourceId),
            and(
              eq(LocalEntityRelation.sourceId, cursor.sourceId),
              gt(LocalEntityRelation.relation, cursor.relation),
            ),
            and(
              eq(LocalEntityRelation.sourceId, cursor.sourceId),
              eq(LocalEntityRelation.relation, cursor.relation),
              gt(LocalEntityRelation.targetId, cursor.targetId),
            ),
            and(
              eq(LocalEntityRelation.sourceId, cursor.sourceId),
              eq(LocalEntityRelation.relation, cursor.relation),
              eq(LocalEntityRelation.targetId, cursor.targetId),
              gt(LocalEntityRelation.sourceRevisionHash, cursor.sourceRevisionHash),
            ),
          ))
      .orderBy(
        asc(LocalEntityRelation.sourceId),
        asc(LocalEntityRelation.relation),
        asc(LocalEntityRelation.targetId),
        asc(LocalEntityRelation.sourceRevisionHash),
      )
      .limit(reanchorReadBatchSize),
    relationsRowKey,
    relationRowHash,
  );

  await processChunks(
    'cards',
    cursor => db.select()
      .from(LocalCard)
      .where(cursor == null ? undefined : gt(LocalCard.cardId, cursor.cardId))
      .orderBy(asc(LocalCard.cardId))
      .limit(reanchorReadBatchSize),
    cardsRowKey,
    cardRowHash,
  );

  updateProgress('本地 baseline 行重建完成');

  const builds = [...collectedBuilds].sort((left, right) => left - right);

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

  const range = input.previousRange != null
    ? {
        sourceTagMin: Math.min(input.previousRange.sourceTagMin, sourceTags[0]!),
        sourceTagMax: Math.max(input.previousRange.sourceTagMax, sourceTags[sourceTags.length - 1]!),
        buildMin: Math.min(input.previousRange.buildMin, builds[0]!),
        buildMax: Math.max(input.previousRange.buildMax, builds[builds.length - 1]!),
      }
    : {
        sourceTagMin: sourceTags[0]!,
        sourceTagMax: sourceTags[sourceTags.length - 1]!,
        buildMin: builds[0]!,
        buildMax: builds[builds.length - 1]!,
      };

  return {
    counts: {
      totalRowCount,
      changedRowCount: 0,
      insertedRowCount: 0,
      updatedRowCount: 0,
      deletedRowCount: 0,
      unchangedRowCount: totalRowCount,
      cardRowCount: countsByTable.cardRowCount,
      entityRowCount: countsByTable.entityRowCount,
      localizationRowCount: countsByTable.localizationRowCount,
      relationRowCount: countsByTable.relationRowCount,
    },
    range,
    manifestHash: manifest.digest('hex'),
  };
}

/** Remote publish gate rejects unregistered streams, fingerprint mismatches, and stale baselines. */
async function assertRemotePublishGate(
  remoteDb: PublishDb,
  input: {
    publishTarget: string;
    environment: string;
    publishType: string;
    targetFingerprint: string;
    manifestHash: string;
    previousManifestHash: string | null;
    sourceTagMax: number;
    generationFingerprint: GenerationFingerprint;
    generationOrder: GenerationOrder;
    leaseHolderId: string;
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
      updatedAt: now,
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

  if (remoteManifestHash !== input.previousManifestHash) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} baseline changed: expected ${input.previousManifestHash ?? 'null'}, got ${remoteManifestHash ?? 'null'}.`,
    );
  }

  if (ledger != null && ledger.sourceTagMax > input.sourceTagMax) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} sourceTagMax regressed: incoming ${input.sourceTagMax}, remote ${ledger.sourceTagMax}.`,
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
    && ledger.sourceTagMax === input.sourceTagMax
    && ledger.manifestHash !== input.manifestHash
  ) {
    throw new Error(
      `Remote publish stream ${input.publishTarget}/${input.environment}/${input.publishType} manifest diverged on the same lineage: incoming ${input.manifestHash}, remote ${ledger.manifestHash}.`,
    );
  }

  return { registration: leased, ledger };
}

/** Release one ordinary publish lease after the batch reaches a terminal state in this process. */
async function releaseRemotePublishLease(
  remoteDb: PublishDb,
  input: {
    publishTarget: string;
    environment: string;
    publishType: string;
    leaseHolderId: string;
  },
) {
  await remoteDb.update(PublishStreamRegistration)
    .set({
      leaseHolderId: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(PublishStreamRegistration.publishTarget, input.publishTarget),
      eq(PublishStreamRegistration.environment, input.environment),
      eq(PublishStreamRegistration.publishType, input.publishType),
      eq(PublishStreamRegistration.leaseHolderId, input.leaseHolderId),
    ));
}

/** Extend one ordinary publish lease while the same batch keeps making progress. */
async function renewRemotePublishLease(
  remoteDb: PublishDb,
  input: {
    publishTarget: string;
    environment: string;
    publishType: string;
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

function cardsRowKey(row: typeof LocalCard.$inferSelect): string {
  return serializeRowKey({ cardId: row.cardId });
}

function entitiesRowKey(row: typeof LocalEntity.$inferSelect): string {
  return serializeRowKey({
    cardId: row.cardId,
    revisionHash: row.revisionHash,
  });
}

function localizationsRowKey(row: typeof LocalEntityLocalization.$inferSelect): string {
  return serializeRowKey({
    cardId: row.cardId,
    lang: row.lang,
    localizationHash: row.localizationHash,
    revisionHash: row.revisionHash,
  });
}

function relationsRowKey(row: typeof LocalEntityRelation.$inferSelect): string {
  return serializeRowKey({
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
  segments?: { name: string; done: number; total: number }[];
}) => void;

/** All local rows loaded from all four publish tables and indexed by PK.
 *
 * When `previousHashes` and `lastPublishedAt` are provided, the baseline becomes the
 * unchanged current-state anchor and only row keys seen in PublishRowChangeLog are reloaded.
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
  const hasBaseline = lastPublishedAt != null;

  if (hasBaseline && lastPublishedAt) {
    onProgress?.({ phase: 'loading_snapshots', message: '正在加载变更日志候选...' });

    const changedRows = await db.select({
      tableName: PublishRowChangeLog.tableName,
      rowKey: PublishRowChangeLog.rowKey,
    })
      .from(PublishRowChangeLog)
      .where(gt(PublishRowChangeLog.changedAt, lastPublishedAt));

    const changedKeysByTable = new Map<TableName, Set<string>>();

    for (const row of changedRows) {
      const tableName = row.tableName as TableName;

      if (!changedKeysByTable.has(tableName)) {
        changedKeysByTable.set(tableName, new Set());
      }

      changedKeysByTable.get(tableName)!.add(row.rowKey);
    }

    const data: CurrentRowData = {
      cards: new Map(),
      entities: new Map(),
      localizations: new Map(),
      relations: new Map(),
    };
    const states: PublishRowState[] = [];
    const allEntityVersions: number[][] = [];

    if (previousHashes) {
      // Baseline rows remain the accepted current state until a newer local write supersedes them.
      for (const [tableName, rows] of previousHashes) {
        for (const [rowKey, rowHash] of rows) {
          states.push({ tableName, rowKey, rowHash });
        }
      }
    }

    const changedKeyTotal = [...changedKeysByTable.values()].reduce((sum, keys) => sum + keys.size, 0);
    let processed = 0;

    for (const tableName of ['entities', 'entity_localizations', 'entity_relations', 'cards'] as const) {
      const rowKeys = [...(changedKeysByTable.get(tableName) ?? new Set())];

      onProgress?.({
        phase: 'loading_snapshots',
        message: `正在回查 ${tableName} 变更行...`,
        completed: processed,
        total: changedKeyTotal,
      });

      const rows = await loadRowDataChunk(db, tableName, rowKeys);

      for (const rowKey of rowKeys) {
        const row = rows.get(rowKey) ?? null;

        if (row == null) {
          processed += 1;
          continue;
        }

        switch (tableName) {
          case 'entities': {
            const entity = row as typeof LocalEntity.$inferSelect;
            data.entities.set(rowKey, entity);
            allEntityVersions.push(entity.version);
            states.push({ tableName, rowKey, rowHash: entityRowHash(entity) });
            break;
          }
          case 'entity_localizations': {
            const localization = row as typeof LocalEntityLocalization.$inferSelect;
            data.localizations.set(rowKey, localization);
            states.push({ tableName, rowKey, rowHash: localizationRowHash(localization) });
            break;
          }
          case 'entity_relations': {
            const relation = row as typeof LocalEntityRelation.$inferSelect;
            data.relations.set(rowKey, relation);
            states.push({ tableName, rowKey, rowHash: relationRowHash(relation) });
            break;
          }
          case 'cards': {
            const card = row as typeof LocalCard.$inferSelect;
            data.cards.set(rowKey, card);
            states.push({ tableName, rowKey, rowHash: cardRowHash(card) });
            break;
          }
        }

        processed += 1;
      }
    }

    if (processed > 0) {
      onProgress?.({
        phase: 'loading_snapshots',
        message: '变更日志候选加载完成',
        completed: processed,
        total: changedKeyTotal,
      });
    }

    return { states, data, allEntityVersions };
  }

  // --- Entities ---
  onProgress?.({ phase: 'loading_snapshots', message: '正在加载 entities...' });

  let entityChangedRows: (typeof LocalEntity.$inferSelect)[];

  entityChangedRows = await db.select()
    .from(LocalEntity)
    .orderBy(asc(LocalEntity.cardId), asc(LocalEntity.revisionHash));

  // --- Localizations ---
  const entityTotal = entityChangedRows.length;

  onProgress?.({ phase: 'loading_snapshots', message: '正在加载 localizations...', completed: entityTotal });

  let localizationChangedRows: (typeof LocalEntityLocalization.$inferSelect)[];

  localizationChangedRows = await db.select()
    .from(LocalEntityLocalization)
    .orderBy(
      asc(LocalEntityLocalization.cardId),
      asc(LocalEntityLocalization.lang),
      asc(LocalEntityLocalization.revisionHash),
      asc(LocalEntityLocalization.localizationHash),
    );

  // --- Relations ---
  onProgress?.({ phase: 'loading_snapshots', message: '正在加载 relations...', completed: entityTotal });

  let relationChangedRows: (typeof LocalEntityRelation.$inferSelect)[];

  relationChangedRows = await db.select()
    .from(LocalEntityRelation)
    .orderBy(
      asc(LocalEntityRelation.sourceId),
      asc(LocalEntityRelation.relation),
      asc(LocalEntityRelation.targetId),
      asc(LocalEntityRelation.sourceRevisionHash),
    );

  // --- Cards ---
  onProgress?.({ phase: 'loading_snapshots', message: '正在加载 cards...' });

  let cardChangedRows: (typeof LocalCard.$inferSelect)[];

  cardChangedRows = await db.select()
    .from(LocalCard)
    .orderBy(asc(LocalCard.cardId));

  // --- Build states and data ---
  const data: CurrentRowData = {
    cards: new Map(),
    entities: new Map(),
    localizations: new Map(),
    relations: new Map(),
  };
  const states: PublishRowState[] = [];
  const allEntityVersions: number[][] = [];

  const localizationTotal = localizationChangedRows.length;
  const relationTotal = relationChangedRows.length;
  const hashTotal = entityTotal + localizationTotal + relationTotal + cardChangedRows.length;

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

  for (const row of entityChangedRows) {
    const pk = entitiesRowKey(row);

    data.entities.set(pk, row);
    allEntityVersions.push(row.version);

    states.push({
      tableName: 'entities',
      rowKey: pk,
      rowHash: entityRowHash(row),
    });
    hashCount += 1;
    maybeReport();
  }

  onProgress?.({ phase: 'loading_snapshots', message: '正在计算 localizations 行 hash...', completed: hashCount, total: hashTotal });

  for (const row of localizationChangedRows) {
    const pk = localizationsRowKey(row);

    data.localizations.set(pk, row);

    states.push({
      tableName: 'entity_localizations',
      rowKey: pk,
      rowHash: localizationRowHash(row),
    });
    hashCount += 1;
    maybeReport();
  }

  onProgress?.({ phase: 'loading_snapshots', message: '正在计算 relations 行 hash...', completed: hashCount, total: hashTotal });

  for (const row of relationChangedRows) {
    const pk = relationsRowKey(row);

    data.relations.set(pk, row);

    states.push({
      tableName: 'entity_relations',
      rowKey: pk,
      rowHash: relationRowHash(row),
    });
    hashCount += 1;
    maybeReport();
  }

  onProgress?.({ phase: 'loading_snapshots', message: '正在计算 cards 行 hash...', completed: hashCount, total: hashTotal });

  for (const card of cardChangedRows) {
    const pk = cardsRowKey(card);

    data.cards.set(pk, card);

    states.push({
      tableName: 'cards',
      rowKey: pk,
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

/** Current accepted row hashes loaded directly from the row baseline table. */
export async function loadBaselineRowHashes(
  db: PublishDb,
  stream: PublishStream,
): Promise<{
    baseline: typeof PublishBaseline.$inferSelect | null;
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
  db: PublishDb,
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

  if (previousRange != null) {
    return {
      sourceTagMin: Math.min(previousRange.sourceTagMin, sourceTags[0]!),
      sourceTagMax: Math.max(previousRange.sourceTagMax, sourceTags[sourceTags.length - 1]!),
      buildMin: Math.min(previousRange.buildMin, builds[0]!),
      buildMax: Math.max(previousRange.buildMax, builds[builds.length - 1]!),
    };
  }

  return {
    sourceTagMin: sourceTags[0]!,
    sourceTagMax: sourceTags[sourceTags.length - 1]!,
    buildMin: builds[0]!,
    buildMax: builds[builds.length - 1]!,
  };
}

/** Batch-row plans and aggregate counts derived from current states and baseline row hashes. */
function buildBatchRowPlans(
  currentStates: PublishRowState[],
  baselineRowHashes: Map<TableName, Map<string, string>>,
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

    currentByTable.get(state.tableName)!.set(state.rowKey, state.rowHash);
  }

  const allTables = new Set<TableName>([...currentByTable.keys(), ...baselineRowHashes.keys()]);
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

    return cmp !== 0 ? cmp : a.rowKey.localeCompare(b.rowKey);
  });

  const manifestHash = hashJson(plans
    .filter(p => p.action !== 'delete')
    .map(p => ({
      tableName: p.tableName,
      rowKey: p.rowKey,
      rowHash: p.rowHash,
    })));

  return { plans, counts, manifestHash };
}

/** Draft publish batch row inserted before remote apply begins. */
export async function insertPublishBatch(
  db: PublishDb,
  input: {
    batchId: string;
    publishTarget: string;
    environment: string;
    targetFingerprint: string;
    publishType: string;
    operationKind: PublishOperationKind;
    range: PublishDatasetRange;
    generationFingerprint: GenerationFingerprint;
    generationOrder: GenerationOrder;
    manifestHash: string;
    previousManifestHash: string | null;
    counts: PublishBatchCounts;
  },
): Promise<void> {
  const now = new Date();

  await db.insert(PublishBatch).values({
    id: input.batchId,
    publishTarget: input.publishTarget,
    environment: input.environment,
    targetFingerprint: input.targetFingerprint,
    publishType: input.publishType,
    operationKind: input.operationKind,
    sourceTagMin: input.range.sourceTagMin,
    sourceTagMax: input.range.sourceTagMax,
    buildMin: input.range.buildMin,
    buildMax: input.range.buildMax,
    generationFingerprint: input.generationFingerprint,
    generationOrder: input.generationOrder,
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

/** Draft reanchor batch inserted before the local baseline rebuild starts. */
export async function insertDraftReanchorBatch(
  db: PublishDb,
  input: {
    batchId: string;
    publishTarget: string;
    environment: string;
    targetFingerprint: string;
    publishType: string;
    previousRange: PublishDatasetRange | null;
    previousManifestHash: string | null;
    generationFingerprint: GenerationFingerprint;
    generationOrder: GenerationOrder;
  },
): Promise<void> {
  const range = input.previousRange ?? {
    sourceTagMin: 1,
    sourceTagMax: 1,
    buildMin: 1,
    buildMax: 1,
  };
  const now = new Date();

  await db.insert(PublishBatch).values({
    id: input.batchId,
    publishTarget: input.publishTarget,
    environment: input.environment,
    targetFingerprint: input.targetFingerprint,
    publishType: input.publishType,
    operationKind: publishOperationKindSchema.enum.reanchor,
    sourceTagMin: range.sourceTagMin,
    sourceTagMax: range.sourceTagMax,
    buildMin: range.buildMin,
    buildMax: range.buildMax,
    generationFingerprint: input.generationFingerprint,
    generationOrder: input.generationOrder,
    manifestHash: 'pending',
    previousManifestHash: input.previousManifestHash,
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
    status: 'planning',
    error: null,
    summary: null,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: null,
  });
}

/** Per-row publish batch rows inserted before the remote transaction starts. */
async function insertPlannedBatchRows(
  db: PublishDb,
  batchId: string,
  plans: PublishBatchRowPlan[],
  onProgress?: StepProgress,
  signal?: PublishStopSignal,
): Promise<void> {
  const now = new Date();
  const rows = plans.map(plan => ({
    batchId,
    tableName: plan.tableName,
    rowKey: plan.rowKey,
    rowHash: plan.rowHash,
    previousRowHash: plan.previousRowHash,
    action: plan.action,
    status: plan.action === 'unchanged' ? 'skipped' as const : 'pending' as const,
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

    if (signal?.aborted) {
      throw new PublishJobInterruptedError('stopped', '发布已停止');
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
    publishTarget: string;
    environment: string;
    targetFingerprint: string;
    publishType: string;
    range: PublishDatasetRange;
    generationFingerprint: GenerationFingerprint;
    generationOrder: GenerationOrder;
    counts: PublishBatchCounts;
    manifestHash: string;
    publishedAt: Date;
  },
): Promise<void> {
  const summary = {
    batchId: input.batchId,
    publishTarget: input.publishTarget,
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

  const batchRows = await db.select({
    tableName: PublishBatchRow.tableName,
    rowKey:    PublishBatchRow.rowKey,
    rowHash:   PublishBatchRow.rowHash,
    action:    PublishBatchRow.action,
  })
    .from(PublishBatchRow)
    .where(eq(PublishBatchRow.batchId, input.batchId));

  await db.update(PublishBatch)
    .set({
      targetFingerprint: input.targetFingerprint,
      sourceTagMin: input.range.sourceTagMin,
      sourceTagMax: input.range.sourceTagMax,
      buildMin: input.range.buildMin,
      buildMax: input.range.buildMax,
      generationFingerprint: input.generationFingerprint,
      generationOrder: input.generationOrder,
      manifestHash: input.manifestHash,
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
      status: 'completed',
      error: null,
      summary,
      completedAt: input.publishedAt,
      updatedAt: input.publishedAt,
    })
    .where(eq(PublishBatch.id, input.batchId));

  const nextBaselineDeletes = batchRows
    .filter(row => row.action === 'delete')
    .map(row => row.rowKey);

  if (nextBaselineDeletes.length > 0) {
    for (const chunk of chunkValues(nextBaselineDeletes, 1000)) {
      await db.delete(PublishRowBaseline)
        .where(and(
          eq(PublishRowBaseline.publishTarget, input.publishTarget),
          eq(PublishRowBaseline.environment, input.environment),
          eq(PublishRowBaseline.publishType, input.publishType),
          inArray(PublishRowBaseline.rowKey, chunk),
        ));
    }
  }

  for (const row of batchRows) {
    if (row.action === 'delete') {
      continue;
    }

    await db.insert(PublishRowBaseline).values({
      publishTarget: input.publishTarget,
      environment: input.environment,
      publishType: input.publishType,
      tableName: row.tableName,
      rowKey: row.rowKey,
      rowHash: row.rowHash,
      sourceBatchId: input.batchId,
      publishedAt: input.publishedAt,
      createdAt: input.publishedAt,
      updatedAt: input.publishedAt,
    })
      .onConflictDoUpdate({
        target: [
          PublishRowBaseline.publishTarget,
          PublishRowBaseline.environment,
          PublishRowBaseline.publishType,
          PublishRowBaseline.tableName,
          PublishRowBaseline.rowKey,
        ],
        set: {
          rowHash: row.rowHash,
          sourceBatchId: input.batchId,
          publishedAt: input.publishedAt,
          updatedAt: input.publishedAt,
        },
      });
  }

  await db.insert(PublishBaseline).values({
    publishTarget: input.publishTarget,
    environment: input.environment,
    publishType: input.publishType,
    targetFingerprint: input.targetFingerprint,
    batchId: input.batchId,
    sourceTagMin: input.range.sourceTagMin,
    sourceTagMax: input.range.sourceTagMax,
    buildMin: input.range.buildMin,
    buildMax: input.range.buildMax,
    generationFingerprint: input.generationFingerprint,
    generationOrder: input.generationOrder,
    manifestHash: input.manifestHash,
    totalRowCount: input.counts.totalRowCount,
    publishedAt: input.publishedAt,
    createdAt: input.publishedAt,
    updatedAt: input.publishedAt,
  })
    .onConflictDoUpdate({
      target: [
        PublishBaseline.publishTarget,
        PublishBaseline.environment,
        PublishBaseline.publishType,
      ],
      set: {
        environment: input.environment,
        publishType: input.publishType,
        targetFingerprint: input.targetFingerprint,
        batchId: input.batchId,
        sourceTagMin: input.range.sourceTagMin,
        sourceTagMax: input.range.sourceTagMax,
        buildMin: input.range.buildMin,
        buildMax: input.range.buildMax,
        generationFingerprint: input.generationFingerprint,
        generationOrder: input.generationOrder,
        manifestHash: input.manifestHash,
        totalRowCount: input.counts.totalRowCount,
        publishedAt: input.publishedAt,
        updatedAt: input.publishedAt,
      },
    });

    // Clean up batch rows from old completed batches for this publish stream.
    const oldBatchIds = await db.select({ id: PublishBatch.id })
      .from(PublishBatch)
      .where(and(
        eq(PublishBatch.publishTarget, input.publishTarget),
        eq(PublishBatch.environment, input.environment),
        eq(PublishBatch.publishType, input.publishType),
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
export async function finalizeReanchorBatchSuccess(
  db: PublishDb,
  input: {
    batchId: string;
    publishTarget: string;
    environment: string;
    targetFingerprint: string;
    publishType: string;
    range: PublishDatasetRange;
    generationFingerprint: GenerationFingerprint;
    generationOrder: GenerationOrder;
    counts: PublishBatchCounts;
    manifestHash: string;
    publishedAt: Date;
  },
): Promise<void> {
  const summary = {
    batchId: input.batchId,
    publishTarget: input.publishTarget,
    environment: input.environment,
    operationKind: publishOperationKindSchema.enum.reanchor,
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

  await db.insert(PublishBaseline).values({
    publishTarget: input.publishTarget,
    environment: input.environment,
    publishType: input.publishType,
    targetFingerprint: input.targetFingerprint,
    batchId: input.batchId,
    sourceTagMin: input.range.sourceTagMin,
    sourceTagMax: input.range.sourceTagMax,
    buildMin: input.range.buildMin,
    buildMax: input.range.buildMax,
    generationFingerprint: input.generationFingerprint,
    generationOrder: input.generationOrder,
    manifestHash: input.manifestHash,
    totalRowCount: input.counts.totalRowCount,
    publishedAt: input.publishedAt,
    createdAt: input.publishedAt,
    updatedAt: input.publishedAt,
  })
    .onConflictDoUpdate({
      target: [
        PublishBaseline.publishTarget,
        PublishBaseline.environment,
        PublishBaseline.publishType,
      ],
      set: {
        targetFingerprint: input.targetFingerprint,
        batchId: input.batchId,
        sourceTagMin: input.range.sourceTagMin,
        sourceTagMax: input.range.sourceTagMax,
        buildMin: input.range.buildMin,
        buildMax: input.range.buildMax,
        generationFingerprint: input.generationFingerprint,
        generationOrder: input.generationOrder,
        manifestHash: input.manifestHash,
        totalRowCount: input.counts.totalRowCount,
        publishedAt: input.publishedAt,
        updatedAt: input.publishedAt,
      },
    });

  await db.update(PublishBatch)
    .set({
      status: 'completed',
      error: null,
      summary,
      completedAt: input.publishedAt,
      updatedAt: input.publishedAt,
    })
    .where(eq(PublishBatch.id, input.batchId));
}

/** Failed batch state persisted after the remote apply aborts. */
async function finalizePublishBatchFailure(
  db: PublishDb,
  batchId: string,
  failure: PublishApplyFailure,
): Promise<void> {
  const now = new Date();

  if (failure.tableName != null && failure.rowKey != null) {
    await db.update(PublishBatchRow)
      .set({
        status: 'failed',
        error: failure.message,
        updatedAt: now,
      })
      .where(and(
        eq(PublishBatchRow.batchId, batchId),
        eq(PublishBatchRow.tableName, failure.tableName),
        eq(PublishBatchRow.rowKey, failure.rowKey),
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

/** Stopped batch state persisted after a cooperative stop request interrupts execution. */
async function finalizePublishBatchStopped(
  db: PublishDb,
  batchId: string,
  message: string,
): Promise<void> {
  const now = new Date();

  await db.update(PublishBatch)
    .set({
      status: 'stopped',
      error: message,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(PublishBatch.id, batchId));
}

/** Cancels one residual local batch when no in-memory publish job is still executing it. */
export async function cancelIncompletePublishBatch(input: {
  batchId: string;
  publishTarget?: string;
  environment?: string;
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
async function upsertRemotePublishLedger(
  tx: PublishDbTx,
  input: {
    batchId: string;
    publishTarget: string;
    environment: string;
    targetFingerprint: string;
    publishType: string;
    range: PublishDatasetRange;
    generationFingerprint: GenerationFingerprint;
    generationOrder: GenerationOrder;
    counts: PublishBatchCounts;
    manifestHash: string;
    publishedAt: Date;
  },
): Promise<void> {
  await tx.insert(PublishLedger).values({
    publishTarget: input.publishTarget,
    environment: input.environment,
    publishType: input.publishType,
    targetFingerprint: input.targetFingerprint,
    batchId: input.batchId,
    sourceTagMin: input.range.sourceTagMin,
    sourceTagMax: input.range.sourceTagMax,
    buildMin: input.range.buildMin,
    buildMax: input.range.buildMax,
    generationFingerprint: input.generationFingerprint,
    generationOrder: input.generationOrder,
    manifestHash: input.manifestHash,
    totalRowCount: input.counts.totalRowCount,
    changedRowCount: input.counts.changedRowCount,
    publishedAt: input.publishedAt,
    createdAt: input.publishedAt,
    updatedAt: input.publishedAt,
  })
    .onConflictDoUpdate({
      target: [
        PublishLedger.publishTarget,
        PublishLedger.environment,
        PublishLedger.publishType,
      ],
      set: {
        environment: input.environment,
        publishType: input.publishType,
        targetFingerprint: input.targetFingerprint,
        batchId: input.batchId,
        sourceTagMin: input.range.sourceTagMin,
        sourceTagMax: input.range.sourceTagMax,
        buildMin: input.range.buildMin,
        buildMax: input.range.buildMax,
        generationFingerprint: input.generationFingerprint,
        generationOrder: input.generationOrder,
        manifestHash: input.manifestHash,
        totalRowCount: input.counts.totalRowCount,
        changedRowCount: input.counts.changedRowCount,
        publishedAt: input.publishedAt,
        updatedAt: input.publishedAt,
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
      await tx.delete(RemoteCard).where(eq(RemoteCard.cardId, rowKey.cardId!));
      return;
    case 'entities':
      await tx.delete(RemoteEntity).where(and(
        eq(RemoteEntity.cardId, rowKey.cardId!),
        eq(RemoteEntity.revisionHash, rowKey.revisionHash!),
      ));
      return;
    case 'entity_localizations':
      await tx.delete(RemoteEntityLocalization).where(and(
        eq(RemoteEntityLocalization.cardId, rowKey.cardId!),
        eq(RemoteEntityLocalization.lang, rowKey.lang! as Locale),
        eq(RemoteEntityLocalization.revisionHash, rowKey.revisionHash!),
        eq(RemoteEntityLocalization.localizationHash, rowKey.localizationHash!),
      ));
      return;
    case 'entity_relations':
      await tx.delete(RemoteEntityRelation).where(and(
        eq(RemoteEntityRelation.sourceId, rowKey.sourceId!),
        eq(RemoteEntityRelation.sourceRevisionHash, rowKey.sourceRevisionHash!),
        eq(RemoteEntityRelation.relation, rowKey.relation!),
        eq(RemoteEntityRelation.targetId, rowKey.targetId!),
      ));
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
        .onConflictDoUpdate({
          target: RemoteCard.cardId,
          set: { legalities: cardRow.legalities },
        });
    }

    return;
  }

  const now = new Date();

  if (tableName === 'entities') {
    const entityRow = row as typeof LocalEntity.$inferSelect;

    await tx.insert(RemoteEntity).values({ ...entityRow, updatedAt: now })
      .onConflictDoUpdate({
        target: [RemoteEntity.cardId, RemoteEntity.revisionHash],
        set: { ...entityRow, updatedAt: now },
      });
    return;
  }

  if (tableName === 'entity_localizations') {
    const locRow = row as typeof LocalEntityLocalization.$inferSelect;

    await tx.insert(RemoteEntityLocalization).values({ ...locRow, updatedAt: now })
      .onConflictDoUpdate({
        target: [RemoteEntityLocalization.cardId, RemoteEntityLocalization.lang, RemoteEntityLocalization.revisionHash, RemoteEntityLocalization.localizationHash],
        set: { ...locRow, updatedAt: now },
      });
    return;
  }

  const relRow = row as typeof LocalEntityRelation.$inferSelect;

  await tx.insert(RemoteEntityRelation).values({ ...relRow, updatedAt: now })
    .onConflictDoUpdate({
      target: [RemoteEntityRelation.sourceId, RemoteEntityRelation.sourceRevisionHash, RemoteEntityRelation.relation, RemoteEntityRelation.targetId],
      set: { ...relRow, updatedAt: now },
    });
}

/** Structured remote-apply failure normalized from an unknown thrown value. */
function normalizePublishApplyFailure(error: unknown): PublishApplyFailure {
  if (typeof error === 'object' && error != null && 'message' in error && typeof error.message === 'string') {
    const tableName = 'tableName' in error && typeof error.tableName === 'string'
      ? error.tableName as TableName
      : null;
    const rowKey = 'rowKey' in error && typeof error.rowKey === 'string'
      ? error.rowKey
      : null;

    return { tableName, rowKey, message: error.message };
  }

  return { tableName: null, rowKey: null, message: getErrorMessage(error) };
}

/** Remote transaction that applies one publish batch at the row level. */
async function applyRowPlansToRemote(
  remoteDb: PublishDb,
  input: {
    data: CurrentRowData;
    plans: PublishBatchRowPlan[];
    batchId: string;
    publishTarget: string;
    environment: string;
    targetFingerprint: string;
    publishType: string;
    range: PublishDatasetRange;
    generationFingerprint: GenerationFingerprint;
    generationOrder: GenerationOrder;
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
            const rowKeyParsed = parseRowKey(plan.rowKey);
            let row: unknown;

            switch (plan.tableName) {
              case 'cards':
                row = input.data.cards.get(plan.rowKey);

                break;
              case 'entities':
                row = input.data.entities.get(plan.rowKey);

                break;
              case 'entity_localizations':
                row = input.data.localizations.get(plan.rowKey);

                break;
              case 'entity_relations':
                row = input.data.relations.get(plan.rowKey);

                break;
            }

            if (row == null) {
              throw new Error(`Current row data for ${plan.tableName} ${plan.rowKey} is missing during remote apply.`);
            }

            if (plan.action === 'update' && plan.tableName !== 'cards') {
              await deleteRemoteRow(tx, plan.tableName, rowKeyParsed);
            }

            await insertRemoteRow(tx, plan.tableName, row, plan.action);
            continue;
          }

          if (plan.action === 'delete') {
            const rowKeyParsed = parseRowKey(plan.rowKey);

            await deleteRemoteRow(tx, plan.tableName, rowKeyParsed);
          }

          if (plan.action !== 'unchanged') {
            completed += 1;
            input.onProgress?.(completed);
          }
        } catch (error) {
          throw {
            tableName: plan.tableName,
            rowKey: plan.rowKey,
            message: getErrorMessage(error),
          } satisfies PublishApplyFailure;
        }
      }

      try {
        await upsertRemotePublishLedger(tx, {
          batchId: input.batchId,
          publishTarget: input.publishTarget,
          environment: input.environment,
          targetFingerprint: input.targetFingerprint,
          publishType: input.publishType,
          range: input.range,
          generationFingerprint: input.generationFingerprint,
          generationOrder: input.generationOrder,
          counts: input.counts,
          manifestHash: input.manifestHash,
          publishedAt: input.publishedAt,
        });
      } catch (error) {
        throw {
          tableName: null,
          rowKey: null,
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

/** Groups an array of { tableName, rowKey } by table name. */
function groupKeysByTable(rows: Array<{ tableName: string; rowKey: string }>): Map<TableName, string[]> {
  const byTable = new Map<TableName, string[]>();
  for (const row of rows) {
    const tn = row.tableName as TableName;
    if (!byTable.has(tn)) byTable.set(tn, []);
    byTable.get(tn)!.push(row.rowKey);
  }
  return byTable;
}

/** Returns the partition key for one row based on its table type. */
export function rowKeyOf(row: any, tableName: string): string {
  switch (tableName) {
    case 'cards': return cardsRowKey(row);
    case 'entities': return entitiesRowKey(row);
    case 'entity_localizations': return localizationsRowKey(row);
    case 'entity_relations': return relationsRowKey(row);
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
    default: throw new Error(`Unknown table: ${tableName}`);
  }
}

/** For each row, emit one plan action and accumulate counts / manifest entries. */
export function emitPlan(tableName: string, rowKey: string, curHash: string | null, prevHash: string | null, counts: Record<string, number>, manifestEntries: Array<{ tableName: string; rowKey: string; rowHash: string }>): void {
  const tn = tableName as TableName;
  counts.totalRowCount += 1;
  if (tn === 'cards') counts.cardRowCount += 1;
  else if (tn === 'entities') counts.entityRowCount += 1;
  else if (tn === 'entity_localizations') counts.localizationRowCount += 1;
  else if (tn === 'entity_relations') counts.relationRowCount += 1;
  if (curHash != null && prevHash == null) { counts.insertedRowCount += 1; counts.changedRowCount += 1; manifestEntries.push({ tableName, rowKey, rowHash: curHash }); }
  else if (curHash != null && prevHash != null && curHash !== prevHash) { counts.updatedRowCount += 1; counts.changedRowCount += 1; manifestEntries.push({ tableName, rowKey, rowHash: curHash }); }
  else if (curHash != null && prevHash != null && curHash === prevHash) { counts.unchangedRowCount += 1; }
  else if (curHash == null && prevHash != null) { counts.deletedRowCount += 1; counts.changedRowCount += 1; }
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

/** For one table, loads a chunk and computes hashes directly from raw rows. */
export async function loadTableChunkAndHash(
  db: PublishDb,
  tableName: TableName,
  builds: Set<number>,
  offset: number,
  limit: number,
): Promise<Map<string, string>> {
  const tbl = tableName === 'entities' ? LocalEntity
    : tableName === 'entity_localizations' ? LocalEntityLocalization
    : tableName === 'entity_relations' ? LocalEntityRelation
    : LocalCard;

  const order = tableName === 'entities' ? [asc(LocalEntity.cardId), asc(LocalEntity.revisionHash)]
    : tableName === 'entity_localizations' ? [asc(LocalEntityLocalization.cardId), asc(LocalEntityLocalization.lang), asc(LocalEntityLocalization.revisionHash), asc(LocalEntityLocalization.localizationHash)]
    : tableName === 'entity_relations' ? [asc(LocalEntityRelation.sourceId), asc(LocalEntityRelation.relation), asc(LocalEntityRelation.targetId), asc(LocalEntityRelation.sourceRevisionHash)]
    : [asc(LocalCard.cardId)];

  const rawRows: any[] = await db.select().from(tbl).orderBy(...order).limit(limit).offset(offset);
  const hashes = new Map<string, string>();
  for (const row of rawRows) {
    const rowKey = rowKeyOf(row, tableName);
    const hash = rowHashOf(row, tableName);
    hashes.set(rowKey, hash);
    if (tableName === 'entities') {
      const versions = row.version as number[];
      if (versions) versions.forEach(v => builds.add(v));
    }
  }
  return hashes;
}

/** Plan phase: load data, diff, write batch + rows. Returns metadata needed for execution. */
export async function createPublishPlan(options?: {
  publishType?: string;
  dryRun?: boolean;
  onProgress?: StepProgress;
  publishTarget?: string;
  environment?: string;
  signal?: PublishStopSignal;
  taskRunId?: string;
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
  const signal = options?.signal;
  const target = resolvePublishTargetSelector(options);
  const stream: PublishStreamIdentity = {
    publishTarget: target.publishTarget,
    environment: target.environment,
    publishType,
    targetFingerprint: target.targetFingerprint,
  };
  const localDb = getLocalDb();

  const active = await findActiveStreamBatch(localDb, stream);

  if (active) {
    throw new Error(`当前 publish stream 已有未完成批次 ${active.id} (${active.operationKind})，请先完成或停止后再开始新的操作。`);
  }

  if (signal?.aborted) {
    throw new PublishJobInterruptedError('stopped', '发布已停止');
  }

  onProgress?.({ phase: 'loading_baseline', message: '正在加载上次发布基线...' });

  const { baseline, baselineRowHashes } = await loadBaselineRowHashes(localDb, stream);
  const previousManifestHash = baseline?.manifestHash ?? null;
  const publishedAt = baseline?.publishedAt ?? null;

  if (signal?.aborted) {
    throw new PublishJobInterruptedError('stopped', '发布已停止');
  }

  // Count total rows to process
  let totalRows: number;
  if (publishedAt) {
    const [row] = await localDb.select({ count: count() }).from(PublishRowChangeLog)
      .where(gt(PublishRowChangeLog.changedAt, publishedAt));
    totalRows = Number(row!.count);
  } else {
    const countQueries = await Promise.all(
      ['entities', 'entity_localizations', 'entity_relations', 'cards'].map(table => {
        const tbl = table === 'entities' ? LocalEntity
          : table === 'entity_localizations' ? LocalEntityLocalization
          : table === 'entity_relations' ? LocalEntityRelation
          : LocalCard;
        return localDb.select({ count: count() }).from(tbl);
      }),
    );
    totalRows = countQueries.reduce((s, r) => s + Number(r[0]!.count), 0);
  }

  if (totalRows === 0) {
    throw new Error('No local Hearthstone projection rows are available for publish.');
  }

  // Chunked: load → diff → write PublishBatchRow
  const counts = { totalRowCount: 0, changedRowCount: 0, insertedRowCount: 0, updatedRowCount: 0, deletedRowCount: 0, unchangedRowCount: 0, cardRowCount: 0, entityRowCount: 0, localizationRowCount: 0, relationRowCount: 0 };
  const batchId = dryRun ? '' : randomUUID();
  const manifestEntries: Array<{ tableName: string; rowKey: string; rowHash: string }> = [];
  const builds = new Set<number>();
  const CHUNK_SIZE = 1000;
  let processed = 0;

  if (publishedAt) {
    const touchedKeys = new Set<string>();
    let offset = 0;
    while (offset < totalRows) {
      if (signal?.aborted) throw new PublishJobInterruptedError('stopped', '发布已停止');
      if (options?.taskRunId) {
        const [task] = await localDb.select({ status: TaskRun.status, controlRequestKind: TaskRun.controlRequestKind }).from(TaskRun).where(eq(TaskRun.id, options.taskRunId));
        if (task && (task.status === 'canceling' || task.controlRequestKind === 'cancel')) {
          throw new PublishJobInterruptedError('stopped', '发布已取消');
        }
      }

      const rows = await localDb.select({
        tableName: PublishRowChangeLog.tableName,
        rowKey: PublishRowChangeLog.rowKey,
      })
        .from(PublishRowChangeLog)
        .where(gt(PublishRowChangeLog.changedAt, publishedAt))
        .orderBy(asc(PublishRowChangeLog.tableName), asc(PublishRowChangeLog.rowKey))
        .limit(CHUNK_SIZE)
        .offset(offset);

      if (rows.length === 0) break;

      for (const r of rows) touchedKeys.add(`${r.tableName}:${r.rowKey}`);

      const byTable = groupKeysByTable(rows);
      const chunkHashes = await loadChunkDataAndHash(localDb, byTable, builds);

      for (const [tableName, curRows] of chunkHashes) {
        for (const [rowKey, curHash] of curRows) {
          const prevHash = baselineRowHashes!.get(tableName)?.get(rowKey) ?? null;
          emitPlan(tableName, rowKey, curHash, prevHash, counts, manifestEntries);
        }
      }

      processed += rows.length;
      onProgress?.({ phase: 'loading_snapshots', message: `正在处理变更 ${processed}/${totalRows}...`, completed: processed, total: totalRows, segments: [
        { name: 'cards', done: counts.cardRowCount, total: Math.max(counts.cardRowCount, 1) },
        { name: 'entities', done: counts.entityRowCount, total: Math.max(counts.entityRowCount, 1) },
        { name: 'localizations', done: counts.localizationRowCount, total: Math.max(counts.localizationRowCount, 1) },
        { name: 'relations', done: counts.relationRowCount, total: Math.max(counts.relationRowCount, 1) },
      ] });
      offset += CHUNK_SIZE;
    }

    // Baseline rows not in change_log remain unchanged
    if (baselineRowHashes) {
      for (const [tableName, rows] of baselineRowHashes) {
        for (const [rowKey, rowHash] of rows) {
          if (!touchedKeys.has(`${tableName}:${rowKey}`)) {
            emitPlan(tableName, rowKey, rowHash, rowHash, counts, manifestEntries);
          }
        }
      }
    }
  } else {
    for (const tableName of ['entities', 'entity_localizations', 'entity_relations', 'cards'] as const) {
      let offset = 0;
      while (true) {
        if (signal?.aborted) throw new PublishJobInterruptedError('stopped', '发布已停止');
        if (options?.taskRunId) {
          const [task] = await localDb.select({ status: TaskRun.status, controlRequestKind: TaskRun.controlRequestKind }).from(TaskRun).where(eq(TaskRun.id, options.taskRunId));
          if (task && (task.status === 'canceling' || task.controlRequestKind === 'cancel')) {
            throw new PublishJobInterruptedError('stopped', '发布已取消');
          }
        }

        const tbl = tableName === 'entities' ? LocalEntity
          : tableName === 'entity_localizations' ? LocalEntityLocalization
          : tableName === 'entity_relations' ? LocalEntityRelation
          : LocalCard;

        const order = tableName === 'entities' ? [asc(LocalEntity.cardId), asc(LocalEntity.revisionHash)]
          : tableName === 'entity_localizations' ? [asc(LocalEntityLocalization.cardId), asc(LocalEntityLocalization.lang), asc(LocalEntityLocalization.revisionHash), asc(LocalEntityLocalization.localizationHash)]
          : tableName === 'entity_relations' ? [asc(LocalEntityRelation.sourceId), asc(LocalEntityRelation.relation), asc(LocalEntityRelation.targetId), asc(LocalEntityRelation.sourceRevisionHash)]
          : [asc(LocalCard.cardId)];

        const chunkHashes = await loadTableChunkAndHash(localDb, tableName, builds, offset, CHUNK_SIZE);
        if (chunkHashes.size === 0) break;

        for (const [rowKey, curHash] of chunkHashes) {
          const prevHash = baselineRowHashes?.get(tableName)?.get(rowKey) ?? null;
          emitPlan(tableName, rowKey, curHash, prevHash, counts, manifestEntries);
        }

        processed += chunkHashes.size;
        onProgress?.({ phase: 'loading_snapshots', message: `正在处理 ${tableName} ${processed}/${totalRows}...`, completed: processed, total: totalRows, segments: [
          { name: 'cards', done: counts.cardRowCount, total: Math.max(counts.cardRowCount, 1) },
          { name: 'entities', done: counts.entityRowCount, total: Math.max(counts.entityRowCount, 1) },
          { name: 'localizations', done: counts.localizationRowCount, total: Math.max(counts.localizationRowCount, 1) },
          { name: 'relations', done: counts.relationRowCount, total: Math.max(counts.relationRowCount, 1) },
        ] });
        offset += CHUNK_SIZE;
      }
    }
  }

  const range = await derivePublishDatasetRange(localDb, [[...builds]], baseline ? { sourceTagMin: baseline.sourceTagMin, sourceTagMax: baseline.sourceTagMax, buildMin: baseline.buildMin, buildMax: baseline.buildMax } : null);
  const manifestHash = hashJson(manifestEntries.sort((a, b) => a.tableName.localeCompare(b.tableName) || a.rowKey.localeCompare(b.rowKey)));

  onProgress?.({ phase: 'loading_snapshots', message: '批次计划构建完成', completed: totalRows, total: totalRows, segments: [
    { name: 'cards', done: counts.cardRowCount, total: counts.cardRowCount },
    { name: 'entities', done: counts.entityRowCount, total: counts.entityRowCount },
    { name: 'localizations', done: counts.localizationRowCount, total: counts.localizationRowCount },
    { name: 'relations', done: counts.relationRowCount, total: counts.relationRowCount },
  ] });

  if (dryRun) {
    return { batchId: '', counts, range, manifestHash, previousManifestHash };
  }

  onProgress?.({ phase: 'writing_batch', message: '正在写入批次元数据...' });

  await insertPublishBatch(localDb, {
    batchId,
    publishTarget: target.publishTarget,
    environment: target.environment,
    targetFingerprint: target.targetFingerprint,
    publishType,
    operationKind: publishOperationKindSchema.enum.publish,
    range,
    generationFingerprint: publishCardDataGeneration.fingerprint,
    generationOrder: publishCardDataGeneration.order,
    manifestHash,
    previousManifestHash,
    counts,
  });

  await localDb.update(PublishBatch)
    .set({ status: 'applying', updatedAt: new Date() })
    .where(eq(PublishBatch.id, batchId));

  return { batchId, counts, range, manifestHash, previousManifestHash };
}

/** Rebuilds the local publish baseline from the current local projection without touching remote state. */
export async function reanchorCurrentHsdataPublishBaseline(options?: {
  publishType?: string;
  onProgress?: StepProgress;
  publishTarget?: string;
  environment?: string;
}): Promise<PublishReport> {
  const publishType = options?.publishType ?? 'card_data';
  const onProgress = options?.onProgress;
  const target = resolvePublishTargetSelector(options);
  const stream: PublishStreamIdentity = {
    publishTarget: target.publishTarget,
    environment: target.environment,
    publishType,
    targetFingerprint: target.targetFingerprint,
  };
  const localDb = getLocalDb();

  onProgress?.({ phase: 'loading_baseline', message: '正在加载当前本地 baseline...' });

  const { baseline } = await loadBaselineRowHashes(localDb, stream);
  const previousRange = baseline == null ? null : {
    sourceTagMin: baseline.sourceTagMin,
    sourceTagMax: baseline.sourceTagMax,
    buildMin: baseline.buildMin,
    buildMax: baseline.buildMax,
  };
  const batchId = randomUUID();
  const publishedAt = new Date();

  const active = await findActiveStreamBatch(localDb, stream);

  if (active) {
    throw new Error(`当前 publish stream 已有未完成批次 ${active.id} (${active.operationKind})，请先完成或停止后再开始新的操作。`);
  }

  try {
    await insertDraftReanchorBatch(localDb, {
      batchId,
      publishTarget: target.publishTarget,
      environment: target.environment,
      targetFingerprint: target.targetFingerprint,
      publishType,
      previousRange,
      previousManifestHash: baseline?.manifestHash ?? null,
      generationFingerprint: publishCardDataGeneration.fingerprint,
      generationOrder: publishCardDataGeneration.order,
    });
    await markPublishBatchApplying(localDb, batchId);

    onProgress?.({ phase: 'loading_snapshots', message: '正在统计本地 publish 行数...', completed: 0 });

    const { counts, range, manifestHash } = await rebuildReanchorBaseline(localDb, {
      batchId,
      publishTarget: target.publishTarget,
      environment: target.environment,
      publishType,
      previousRange,
      publishedAt,
      onProgress,
    });

    if (counts.totalRowCount === 0) {
      throw new Error('No local Hearthstone projection rows are available for reanchor.');
    }

    onProgress?.({
      phase: 'finalizing',
      message: '正在写入本地 publish baseline 元数据...',
      completed: counts.totalRowCount,
      total: counts.totalRowCount,
    });

    await finalizeReanchorBatchSuccess(localDb, {
      batchId,
      publishTarget: target.publishTarget,
      environment: target.environment,
      targetFingerprint: target.targetFingerprint,
      publishType,
      range,
      generationFingerprint: publishCardDataGeneration.fingerprint,
      generationOrder: publishCardDataGeneration.order,
      counts,
      manifestHash,
      publishedAt,
    });

    return {
      batchId,
      publishTarget: target.publishTarget,
      environment: target.environment,
      targetFingerprint: target.targetFingerprint,
      publishType,
      operationKind: publishOperationKindSchema.enum.reanchor,
      status: 'completed',
      manifestHash,
      previousManifestHash: baseline?.manifestHash ?? null,
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
  } catch (error) {
    if (error instanceof PublishJobInterruptedError && error.phase === 'stopped') {
      await finalizePublishBatchStopped(localDb, batchId, error.message);
    } else {
      await finalizePublishBatchFailure(localDb, batchId, {
        tableName: null,
        rowKey: null,
        message: getErrorMessage(error),
      });
    }

    throw error;
  }
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
    publishTarget: batch.publishTarget,
    environment: batch.environment,
    targetFingerprint: batch.targetFingerprint,
    publishType: batch.publishType,
    operationKind: batch.operationKind,
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

/** Rejects batches that require explicit high-risk publish entrypoints. */
function assertNormalPublishBatch(batch: Pick<typeof PublishBatch.$inferSelect, 'id' | 'operationKind'>): void {
  if (batch.operationKind === publishOperationKindSchema.enum.publish) {
    return;
  }

  throw new Error(
    `Publish batch ${batch.id} uses high-risk operation ${batch.operationKind} and must be executed through an explicit ${batch.operationKind} entrypoint.`,
  );
}

export async function executePublishBatch(
  batchId: string,
  options?: {
    onProgress?: (event: { phase: string; message: string; totalRowCount?: number | null; completedRowCount?: number | null; segments?: { name: string; done: number; total: number }[] }) => void;
    publishTarget?: string;
    environment?: string;
    signal?: PublishStopSignal;
  },
): Promise<PublishReport> {
  const onProgress = options?.onProgress;
  const signal = options?.signal;
  const target = resolvePublishTargetSelector(options);
  const localDb = getLocalDb();
  const remoteDb = createDb(target.connectionString);
  let leaseHolderId: string | null = null;
  let leaseStream: Pick<typeof PublishStreamRegistration.$inferSelect, 'publishTarget' | 'environment' | 'publishType'> | null = null;

  try {
    const batch = await localDb.select().from(PublishBatch).where(eq(PublishBatch.id, batchId)).then(r => r[0]);

    if (!batch) {
      throw new Error(`Publish batch ${batchId} not found.`);
    }

    assertNormalPublishBatch(batch);

    if (batch.status === 'completed') {
      return buildPublishReport(batch, batch.completedAt ?? batch.updatedAt);
    }

    if (batch.status === 'planning') {
      await localDb.update(PublishBatch)
        .set({ status: 'applying', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(PublishBatch.id, batchId));
    }

    onProgress?.({ phase: 'checking_remote_gate', message: '正在校验远端 publish stream gate...', totalRowCount: null, completedRowCount: null });

    if (signal?.aborted) {
      throw new PublishJobInterruptedError('stopped', '发布已停止');
    }

    await assertRemotePublishGate(remoteDb, {
      publishTarget: batch.publishTarget,
      environment: batch.environment,
      publishType: batch.publishType,
      targetFingerprint: batch.targetFingerprint,
      manifestHash: batch.manifestHash,
      previousManifestHash: batch.previousManifestHash ?? null,
      sourceTagMax: batch.sourceTagMax,
      generationFingerprint: batch.generationFingerprint,
      generationOrder: batch.generationOrder,
      leaseHolderId: batch.id,
    });
    leaseHolderId = batch.id;
    leaseStream = {
      publishTarget: batch.publishTarget,
      environment: batch.environment,
      publishType: batch.publishType,
    };

    // Load pending rows, sorted by table then PK for deterministic order
    const pendingRows = await localDb.select()
      .from(PublishBatchRow)
      .where(and(
        eq(PublishBatchRow.batchId, batchId),
        eq(PublishBatchRow.status, 'pending'),
      ))
      .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowKey));

    const totalPending = pendingRows.length;

    if (totalPending === 0) {
      onProgress?.({ phase: 'applying_remote', message: '所有行已应用完毕', totalRowCount: 0, completedRowCount: 0 });
    } else {
      onProgress?.({ phase: 'applying_remote', message: '正在应用到远程数据库...', totalRowCount: totalPending, completedRowCount: 0 });
    }

    let completedCount = 0;
    const totalChunks = Math.ceil(totalPending / remoteChunkSize);

    for (let i = 0; i < pendingRows.length; i += remoteChunkSize) {
      if (signal?.aborted) {
        throw new PublishJobInterruptedError('stopped', '发布已停止');
      }

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
        const keySet = [...new Set(rows.map(r => r.rowKey))];
        const chunkData = await loadRowDataChunk(localDb, tableName, keySet);

        for (const [pk, data] of chunkData) {
          rowDataMap.set(`${tableName}:${pk}`, data);
        }
      }

      try {
        await remoteDb.transaction(async tx => {
          for (const row of chunk) {
            const tableName = row.tableName as TableName;
            const rowData = rowDataMap.get(`${tableName}:${row.rowKey}`);

            if (rowData == null && row.action !== 'delete') {
              throw new Error(`Row data not found: ${tableName} ${row.rowKey}`);
            }

            if (row.action === 'insert') {
              await insertRemoteRow(tx, tableName, rowData!, 'insert');
            } else if (row.action === 'update') {
              if (tableName !== 'cards') {
                await deleteRemoteRow(tx, tableName, parseRowKey(row.rowKey));
              }

              await insertRemoteRow(tx, tableName, rowData!, 'update');
            } else if (row.action === 'delete') {
              await deleteRemoteRow(tx, tableName, parseRowKey(row.rowKey));
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
              eq(PublishBatchRow.rowKey, row.rowKey),
            ));
        }

        if (leaseHolderId != null && leaseStream != null) {
          await renewRemotePublishLease(remoteDb, {
            publishTarget: leaseStream.publishTarget,
            environment: leaseStream.environment,
            publishType: leaseStream.publishType,
            leaseHolderId,
          });
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
        publishTarget: batch.publishTarget,
        environment: batch.environment,
        targetFingerprint: batch.targetFingerprint,
        publishType: batch.publishType,
        range: { sourceTagMin: batch.sourceTagMin, sourceTagMax: batch.sourceTagMax, buildMin: batch.buildMin, buildMax: batch.buildMax },
        generationFingerprint: batch.generationFingerprint,
        generationOrder: batch.generationOrder,
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
      publishTarget: batch.publishTarget,
      environment: batch.environment,
      targetFingerprint: batch.targetFingerprint,
      publishType: batch.publishType,
      range: { sourceTagMin: batch.sourceTagMin, sourceTagMax: batch.sourceTagMax, buildMin: batch.buildMin, buildMax: batch.buildMax },
      generationFingerprint: batch.generationFingerprint,
      generationOrder: batch.generationOrder,
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

    await localDb.update(PublishBatch)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(PublishBatch.id, batchId));

    await releaseRemotePublishLease(remoteDb, {
      publishTarget: batch.publishTarget,
      environment: batch.environment,
      publishType: batch.publishType,
      leaseHolderId: batch.id,
    });
    leaseHolderId = null;
    leaseStream = null;

    return buildPublishReport(batch, publishedAt);
  } finally {
    if (leaseHolderId != null && leaseStream != null) {
      await releaseRemotePublishLease(remoteDb, {
        publishTarget: leaseStream.publishTarget,
        environment: leaseStream.environment,
        publishType: leaseStream.publishType,
        leaseHolderId,
      });
    }

    await closePublishDb(remoteDb);
  }
}

/** Runs plan + execute in one call. Auto-detects and resumes incomplete batches. */
export async function publishCurrentHsdataToRemote(options?: {
  publishType?: string;
  dryRun?: boolean;
  onProgress?: (event: { phase: string; message: string; totalRowCount?: number | null; completedRowCount?: number | null; segments?: { name: string; done: number; total: number }[] }) => void;
  publishTarget?: string;
  environment?: string;
  signal?: PublishStopSignal;
}): Promise<PublishReport> {
  const onProgress = options?.onProgress;
  const dryRun = options?.dryRun ?? false;
  const signal = options?.signal;
  const localDb = getLocalDb();
  const target = resolvePublishTargetSelector(options);
  const publishType = options?.publishType ?? 'card_data';

  // Dry run: only analyze, skip all writes
  if (dryRun) {
    const plan = await createPublishPlan({
      publishType: options?.publishType,
      dryRun: true,
      signal,
      onProgress: onProgress
        ? (e) => onProgress({ phase: e.phase, message: e.message, totalRowCount: e.total ?? null, completedRowCount: e.completed ?? null, segments: e.segments })
        : undefined,
    });

    return {
      batchId: '',
      publishTarget: target.publishTarget,
      environment: target.environment,
      targetFingerprint: target.targetFingerprint,
      publishType,
      operationKind: publishOperationKindSchema.enum.publish,
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
    .where(and(
      inArray(PublishBatch.status, ['planning', 'applying']),
      eq(PublishBatch.publishTarget, target.publishTarget),
      eq(PublishBatch.environment, target.environment),
      eq(PublishBatch.publishType, publishType),
      eq(PublishBatch.operationKind, publishOperationKindSchema.enum.publish),
    ))
    .orderBy(asc(PublishBatch.createdAt))
    .then(rows => rows[rows.length - 1] ?? null);

  if (incomplete) {
    assertNormalPublishBatch(incomplete);

    onProgress?.({ phase: 'loading_snapshots', message: `检测到未完成的批次 ${incomplete.id}，将从断点继续...`, totalRowCount: null, completedRowCount: null });

    return await executePublishBatch(incomplete.id, {
      ...options,
      signal,
    });
  }

  const plan = await createPublishPlan({
    publishType: options?.publishType,
    signal,
    onProgress: onProgress
      ? (e) => onProgress({ phase: e.phase, message: e.message, totalRowCount: e.total ?? null, completedRowCount: e.completed ?? null, segments: e.segments })
      : undefined,
  });

  return await executePublishBatch(plan.batchId, {
    ...options,
    signal,
  });
}

/** Lists all publish batches for the current target, newest first. */
export async function listPublishBatches(options?: {
  publishTarget?: string;
  environment?: string;
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
  environment?: string;
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
  cardId: z.string(),
  entityCount: z.number(),
  localizationCount: z.number(),
  relationCount: z.number(),
  cardCount: z.number(),
});

export type SingleCardPublishReport = z.infer<typeof singleCardPublishReport>;

/** Publishes a single card from local projection tables to the remote target. */
export async function publishSingleCard(
  cardId: string,
  options?: {
    publishTarget?: string;
    environment?: string;
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
