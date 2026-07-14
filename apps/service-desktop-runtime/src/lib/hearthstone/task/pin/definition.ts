import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { and, asc, count, eq, sql } from 'drizzle-orm';
import { createDb } from '@tcg-cards/db';

import {
  Entity as LocalEntity, EntityLocalization as LocalEntityLocalization,
  EntityRelation as LocalEntityRelation, Card as LocalCard,
  PublishBatch, PublishBaseline, PublishRowBaseline,
} from '@tcg-cards/db/schema/local/hearthstone';
import {
  Entity as RemoteEntity, EntityLocalization as RemoteEntityLocalization,
  EntityRelation as RemoteEntityRelation, Card as RemoteCard,
} from '@tcg-cards/db/schema/remote/hearthstone';

import {
  loadPinRowCounts, pinReadBatchSize, buildManifestLine,
  rowKeyOf, rowHashOf, chunkValues,
  loadBaselineRowHashes, findActiveStreamBatch,
  upsertRemotePublishLedger,
} from '../../hsdata-publish';
import type {
  TableName, PublishDb, PublishDatasetRange,
  GenerationFingerprint, GenerationOrder, PublishBatchCounts,
} from '../../hsdata-publish';
import { requireHearthstonePublishTargetByIdentity } from '../../hsdata-publish-target';
import { publishCardDataGeneration } from '../../publish-generation';
import { getLocalDb } from '../../hsdata-local-db';
import { createDefinition } from '#task/definition';
import type { ProgressFn } from '#task/definition';

export const pinTaskType = 'hsdata_pin';

const pinOutput = z.object({
  batchId: z.string(),
  publishTarget: z.string(),
  environment: z.string(),
  manifestHash: z.string(),
  publishedAt: z.string(),
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
  publishType: z.string(),
  operationKind: z.string(),
  dryRun: z.boolean(),
  status: z.string(),
});

const FULL_SCAN_TABLES: TableName[] = ['entities', 'entity_localizations', 'entity_relations', 'cards'];

interface PinScanState {
  manifest: Bun.CryptoHasher;
  builds: Set<number>;
  totalRowCount: number;
  completed: number;
  scanCursors: Map<TableName, any>;
}

interface PinCtx {
  batchId: string;
  publishTarget: string;
  environment: string;
  targetFingerprint: string;
  publishType: string;
  previousRange: { buildMin: number; buildMax: number } | null;
  previousManifestHash: string | null;
  publishedAt: Date;
  scan?: PinScanState;
}

/** Process one chunk from the current table cursor, writing PublishRowBaseline rows. Returns true when all tables are fully scanned. */
async function scanOneChunk(
  scan: PinScanState,
  ctx: PinCtx,
  progress: ProgressFn<'bounded'>,
): Promise<boolean> {
  const db = getLocalDb();
  const cursors = scan.scanCursors;

  let tableName: TableName | null = null;
  for (const tn of FULL_SCAN_TABLES) { if (cursors.get(tn) !== undefined) { tableName = tn; break; } }
  if (!tableName) return true;

  const cursor = cursors.get(tableName);
  let rawRows: any[];

  if (tableName === 'entities') {
    rawRows = await db.select().from(LocalEntity).where(cursor == null ? undefined : sql`(${LocalEntity.cardId}, ${LocalEntity.revisionHash}) > (${cursor.cardId}, ${cursor.revisionHash})`)
      .orderBy(asc(LocalEntity.cardId), asc(LocalEntity.revisionHash)).limit(pinReadBatchSize) as any[];
  } else if (tableName === 'entity_localizations') {
    rawRows = await db.select().from(LocalEntityLocalization).where(cursor == null ? undefined : sql`(${LocalEntityLocalization.cardId}, ${LocalEntityLocalization.lang}, ${LocalEntityLocalization.revisionHash}, ${LocalEntityLocalization.localizationHash}) > (${cursor.cardId}, ${cursor.lang}, ${cursor.revisionHash}, ${cursor.localizationHash})`)
      .orderBy(asc(LocalEntityLocalization.cardId), asc(LocalEntityLocalization.lang), asc(LocalEntityLocalization.revisionHash), asc(LocalEntityLocalization.localizationHash)).limit(pinReadBatchSize) as any[];
  } else if (tableName === 'entity_relations') {
    rawRows = await db.select().from(LocalEntityRelation).where(cursor == null ? undefined : sql`(${LocalEntityRelation.sourceId}, ${LocalEntityRelation.relation}, ${LocalEntityRelation.targetId}, ${LocalEntityRelation.sourceRevisionHash}) > (${cursor.sourceId}, ${cursor.relation}, ${cursor.targetId}, ${cursor.sourceRevisionHash})`)
      .orderBy(asc(LocalEntityRelation.sourceId), asc(LocalEntityRelation.relation), asc(LocalEntityRelation.targetId), asc(LocalEntityRelation.sourceRevisionHash)).limit(pinReadBatchSize) as any[];
  } else {
    rawRows = await db.select().from(LocalCard).where(cursor == null ? undefined : sql`(${LocalCard.cardId}) > (${cursor.cardId})`)
      .orderBy(asc(LocalCard.cardId)).limit(pinReadBatchSize) as any[];
  }

  if (rawRows.length === 0) {
    cursors.set(tableName, undefined!);
    return scanOneChunk(scan, ctx, progress);
  }

  const baselineRows = rawRows.map((row: any) => {
    const rk = rowKeyOf(row, tableName!);
    const rh = rowHashOf(row, tableName!);
    scan.manifest.update(buildManifestLine({ tableName: tableName!, rowKey: rk, rowHash: rh }));
    if (tableName === 'entities' && row.version) (row.version as number[]).forEach(v => scan.builds.add(v));
    return {
      publishTarget: ctx.publishTarget, environment: ctx.environment, publishType: ctx.publishType,
      tableName: tableName!, rowKey: rk, rowHash: rh,
      sourceBatchId: ctx.batchId,
      publishedAt: ctx.publishedAt, createdAt: new Date(), updatedAt: new Date(),
    };
  });

  for (const chunk of chunkValues(baselineRows, 500)) {
    await db.insert(PublishRowBaseline).values(chunk as any);
  }

  cursors.set(tableName, rawRows[rawRows.length - 1]);
  scan.completed += rawRows.length;
  progress({ done: scan.completed, total: scan.totalRowCount });

  return false;
}

async function insertDraftPinBatch(
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
  const range = input.previousRange ?? { buildMin: 1, buildMax: 1 };
  const now = new Date();

  await db.insert(PublishBatch).values({
    id: input.batchId,
    publishTarget: input.publishTarget,
    environment: input.environment,
    targetFingerprint: input.targetFingerprint,
    publishType: input.publishType,
    operationKind: 'pin' as any,
    buildMin: range.buildMin,
    buildMax: range.buildMax,
    generationFingerprint: input.generationFingerprint,
    generationOrder: input.generationOrder,
    manifestHash: 'pending',
    previousManifestHash: input.previousManifestHash,
    totalRowCount: 0, changedRowCount: 0, insertedRowCount: 0, updatedRowCount: 0, deletedRowCount: 0,
    unchangedRowCount: 0, cardRowCount: 0, entityRowCount: 0, localizationRowCount: 0, relationRowCount: 0,
    status: 'planning', error: null, summary: null,
    createdAt: now, updatedAt: now, startedAt: now, completedAt: null,
  });
}

async function markPublishBatchApplying(db: PublishDb, batchId: string): Promise<void> {
  const now = new Date();
  await db.update(PublishBatch)
    .set({ status: 'applying', startedAt: now, error: null, summary: null, updatedAt: now } as any)
    .where(eq(PublishBatch.id, batchId));
}

async function finalizePinBatchSuccess(
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
    batchId: input.batchId, publishTarget: input.publishTarget, environment: input.environment,
    operationKind: 'pin',
    totalRowCount: input.counts.totalRowCount, changedRowCount: input.counts.changedRowCount,
    insertedRowCount: input.counts.insertedRowCount, updatedRowCount: input.counts.updatedRowCount,
    deletedRowCount: input.counts.deletedRowCount, unchangedRowCount: input.counts.unchangedRowCount,
    cardRowCount: input.counts.cardRowCount, entityRowCount: input.counts.entityRowCount,
    localizationRowCount: input.counts.localizationRowCount, relationRowCount: input.counts.relationRowCount,
    publishedAt: input.publishedAt.toISOString(),
  };

  await db.insert(PublishBaseline).values({
    publishTarget: input.publishTarget, environment: input.environment, publishType: input.publishType,
    targetFingerprint: input.targetFingerprint, batchId: input.batchId,
    buildMin: input.range.buildMin, buildMax: input.range.buildMax,
    generationFingerprint: input.generationFingerprint, generationOrder: input.generationOrder,
    manifestHash: input.manifestHash, totalRowCount: input.counts.totalRowCount,
    publishedAt: input.publishedAt, createdAt: input.publishedAt, updatedAt: input.publishedAt,
  }).onConflictDoUpdate({
    target: [PublishBaseline.publishTarget, PublishBaseline.environment, PublishBaseline.publishType],
    set: {
      targetFingerprint: input.targetFingerprint, batchId: input.batchId,
      buildMin: input.range.buildMin, buildMax: input.range.buildMax,
      generationFingerprint: input.generationFingerprint, generationOrder: input.generationOrder,
      manifestHash: input.manifestHash, totalRowCount: input.counts.totalRowCount,
      publishedAt: input.publishedAt, updatedAt: input.publishedAt,
    },
  });

  await db.update(PublishBatch)
    .set({ status: 'completed', error: null, summary: summary as any, completedAt: input.publishedAt, updatedAt: input.publishedAt } as any)
    .where(eq(PublishBatch.id, input.batchId));
}

export const pinTaskDefinition = createDefinition(pinTaskType, { version: '2026-07-14:v1' })
  .scope(
    z.object({ publishTarget: z.string(), environment: z.string() }),
    {
      type: 'publish_stream' as const,
      resolve: (scope) => ({ key: `${scope.publishTarget}:${scope.environment}:pin`, snapshot: scope }),
    },
  )
  .input(z.strictObject({ publishTarget: z.literal('hearthstone'), environment: z.string().trim().min(1) }))
  .output(pinOutput)
  .context({
    init: (): PinCtx => ({
      batchId: '', publishTarget: '', environment: '', targetFingerprint: '',
      publishType: 'card_data', previousRange: null, previousManifestHash: null, publishedAt: new Date(),
    }),
  })

  // ── Stage 1: validate (simple) ──
  .stage('validate', { label: 'Validate', progressMode: 'simple' })
    .handler(async ({ ctx, input }) => {
      const publishType = 'card_data';
      const target = requireHearthstonePublishTargetByIdentity(input.publishTarget, input.environment);
      const localDb = getLocalDb();
      const stream = {
        publishTarget: target.publishTarget, environment: target.environment,
        publishType, targetFingerprint: target.targetFingerprint,
      };

      const { baseline } = await loadBaselineRowHashes(localDb, stream);
      const active = await findActiveStreamBatch(localDb, stream);
      if (active) {
        throw new Error(`当前 publish stream 已有未完成批次 ${active.id} (${active.operationKind})，请先完成或停止后再开始新的操作。`);
      }

      // Validate local vs remote row counts
      const remoteDb = createDb(target.connectionString);
      try {
        for (const [tableName, localTbl, remoteTbl] of [
          ['entities', LocalEntity, RemoteEntity],
          ['entity_localizations', LocalEntityLocalization, RemoteEntityLocalization],
          ['entity_relations', LocalEntityRelation, RemoteEntityRelation],
          ['cards', LocalCard, RemoteCard],
        ] as const) {
          const [localRow] = await localDb.select({ count: count() }).from(localTbl);
          const [remoteRow] = await remoteDb.select({ count: count() }).from(remoteTbl);
          if (Number(localRow!.count) !== Number(remoteRow!.count)) {
            throw new Error(`本地与远程 ${tableName} 行数不一致: local=${localRow!.count} remote=${remoteRow!.count}。请先执行 publish 同步数据后再 pin。`);
          }
        }
      } finally {
        await remoteDb.$client.end({ timeout: 1 });
      }

      const previousRange = baseline == null ? null : { buildMin: baseline.buildMin, buildMax: baseline.buildMax };
      const batchId = randomUUID();
      const publishedAt = new Date();

      await insertDraftPinBatch(localDb, {
        batchId, publishTarget: target.publishTarget, environment: target.environment,
        targetFingerprint: target.targetFingerprint, publishType,
        previousRange, previousManifestHash: baseline?.manifestHash ?? null,
        generationFingerprint: publishCardDataGeneration.fingerprint,
        generationOrder: publishCardDataGeneration.order,
      });

      await markPublishBatchApplying(localDb, batchId);

      Object.assign(ctx, {
        batchId, publishTarget: target.publishTarget, environment: target.environment,
        targetFingerprint: target.targetFingerprint, publishType,
        previousRange, previousManifestHash: baseline?.manifestHash ?? null, publishedAt,
      });
    })

  // ── Stage 2: loading_snapshots (bounded) ──
  .stage('loading_snapshots', { label: 'Load snapshots', progressMode: 'bounded' })
    .entry(async ({ ctx }) => {
      const counts = await loadPinRowCounts(getLocalDb());
      const db = getLocalDb();

      await db.delete(PublishRowBaseline).where(and(
        eq(PublishRowBaseline.publishTarget, ctx.publishTarget),
        eq(PublishRowBaseline.environment, ctx.environment),
        eq(PublishRowBaseline.publishType, ctx.publishType),
      ));

      ctx.scan = {
        manifest: new Bun.CryptoHasher('sha256'),
        builds: new Set(),
        totalRowCount: counts.totalRowCount,
        completed: 0,
        scanCursors: new Map(FULL_SCAN_TABLES.map(tn => [tn, null])),
      };

      return { total: counts.totalRowCount, blockInput: {} };
    })
    .block(async ({ ctx, blockInput, progress, done }) => {
      if (!ctx.scan) return done(blockInput);
      const finished = await scanOneChunk(ctx.scan, ctx, progress);
      if (finished) {
        const s = ctx.scan;
        const builds = [...s.builds].sort((a, b) => a - b);
        const buildMin = builds[0] ?? 1;
        const buildMax = builds[builds.length - 1] ?? 1;
        const range = ctx.previousRange != null
          ? { buildMin: Math.min(ctx.previousRange.buildMin, buildMin), buildMax: Math.max(ctx.previousRange.buildMax, buildMax) }
          : { buildMin, buildMax };
        const manifestHash = s.manifest.digest('hex');

        progress({ done: s.totalRowCount, total: s.totalRowCount });
        return done({ manifestHash, range, totalRowCount: s.totalRowCount });
      }
      return blockInput;
    })
    .exit(async ({ blockInput }) => blockInput)

  // ── Stage 3: finalizing (simple) ──
  .stage('finalizing', { label: 'Finalize', progressMode: 'simple' })
    .handler(async ({ ctx, input }) => {
      const { manifestHash, range, totalRowCount } = input as any;
      const byTable = await loadPinRowCounts(getLocalDb());
      const localDb = getLocalDb();

      const counts = {
        totalRowCount, changedRowCount: 0, insertedRowCount: 0, updatedRowCount: 0, deletedRowCount: 0,
        unchangedRowCount: totalRowCount,
        cardRowCount: byTable.cardRowCount, entityRowCount: byTable.entityRowCount,
        localizationRowCount: byTable.localizationRowCount, relationRowCount: byTable.relationRowCount,
      };

      await finalizePinBatchSuccess(localDb, {
        batchId: ctx.batchId, publishTarget: ctx.publishTarget, environment: ctx.environment,
        targetFingerprint: ctx.targetFingerprint, publishType: ctx.publishType,
        range, generationFingerprint: publishCardDataGeneration.fingerprint,
        generationOrder: publishCardDataGeneration.order, counts, manifestHash,
        publishedAt: ctx.publishedAt,
      });

      // Write remote ledger
      const target = requireHearthstonePublishTargetByIdentity(ctx.publishTarget, ctx.environment);
      const ledgerDb = createDb(target.connectionString);
      try {
        await ledgerDb.transaction(async (tx: any) => {
          await upsertRemotePublishLedger(tx, {
            batchId: ctx.batchId, publishTarget: ctx.publishTarget, environment: ctx.environment,
            targetFingerprint: ctx.targetFingerprint, publishType: ctx.publishType,
            range, generationFingerprint: publishCardDataGeneration.fingerprint,
            generationOrder: publishCardDataGeneration.order,
            counts: {
              totalRowCount, changedRowCount: 0, insertedRowCount: 0, updatedRowCount: 0, deletedRowCount: 0,
              unchangedRowCount: totalRowCount,
              cardRowCount: byTable.cardRowCount, entityRowCount: byTable.entityRowCount,
              localizationRowCount: byTable.localizationRowCount, relationRowCount: byTable.relationRowCount,
            },
            manifestHash, publishedAt: ctx.publishedAt,
          });
        });
      } finally {
        await ledgerDb.$client.end({ timeout: 1 });
      }

      return {
        batchId: ctx.batchId,
        publishTarget: ctx.publishTarget,
        environment: ctx.environment,
        manifestHash,
        publishedAt: ctx.publishedAt.toISOString(),
        buildMin: range.buildMin,
        buildMax: range.buildMax,
        totalRowCount,
        changedRowCount: 0,
        insertedRowCount: 0,
        updatedRowCount: 0,
        deletedRowCount: 0,
        unchangedRowCount: totalRowCount,
        cardRowCount: byTable.cardRowCount,
        entityRowCount: byTable.entityRowCount,
        localizationRowCount: byTable.localizationRowCount,
        relationRowCount: byTable.relationRowCount,
        publishType: ctx.publishType,
        operationKind: 'pin',
        dryRun: false,
        status: 'completed',
      };
    })
  .build();
