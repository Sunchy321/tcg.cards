import type { PublishTaskCreateInput, PublishTaskParams } from '@tcg-cards/model/src/task-publish';

import type {
  TaskBlock,
  TaskDefinition,
  TaskExecuteStore,
  TaskRunInput,
  TaskScope,
  TaskStageEntry,
  TaskStagePlan,
  TaskStageState,
} from '#task/definition';
import { and, eq, ne, or, asc, desc, count, gt, inArray, isNull, sql } from 'drizzle-orm';

// const TEST_BUILD = 245096;
import { createDb } from '@tcg-cards/db';
import { PublishBaseline, PublishRowBaseline, PublishBatchRow, PublishBatch, SourceVersion } from '@tcg-cards/db/schema/local/hearthstone';
import { TaskRun } from '@tcg-cards/db/schema/local/task';
import { BaseEntity as LocalBaseEntity, BaseEntityLocalization as LocalBaseEntityLocalization, BaseEntityRelation as LocalBaseEntityRelation, BaseCard as LocalBaseCard, Entity as LocalEntity, EntityLocalization as LocalEntityLocalization, EntityRelation as LocalEntityRelation, Card as LocalCard } from '@tcg-cards/db/schema/local/hearthstone';
import { Entity as RemoteEntity, EntityLocalization as RemoteEntityLocalization, EntityRelation as RemoteEntityRelation, Card as RemoteCard } from '@tcg-cards/db/schema/remote/hearthstone';
import { PublishStreamRegistration } from '@tcg-cards/db/schema/remote/publish';
import { loadRowDataChunk, insertRemoteRow, deleteRemoteRow, parseRowKey, loadReanchorRowCounts, reanchorReadBatchSize, buildManifestLine, upsertRemotePublishLedger, assertRemotePublishGate, releaseRemotePublishLease, renewRemotePublishLease, findActiveStreamBatch } from '../../hsdata-publish';
import { hashJson, derivePublishDatasetRange, rowKeyOf, rowHashOf, loadBaselineRowHashes, loadChunkDataAndHash, chunkValues } from '../../hsdata-publish';
import type { TableName, PublishDb } from '../../hsdata-publish';
import { requireHearthstonePublishTargetByIdentity } from '../../hsdata-publish-target';
import { publishCardDataGeneration } from '../../publish-generation';
import { getLocalDb } from '../../hsdata-local-db';

const randomUUID = () => crypto.randomUUID();

export const publishTaskType = 'hsdata_publish';
export const publishTaskScopeType = 'publish_stream';
export const publishTaskDefinitionVersion = '2026-06-22:v1';

export const publishTaskStagePlans: TaskStagePlan[] = [
  { stageKey: 'loading_snapshots', stageIndex: 0, label: 'Load & diff', progressMode: 'bounded', resumeMode: 'none' },
  { stageKey: 'applying_remote', stageIndex: 1, label: 'Apply to remote', progressMode: 'bounded', resumeMode: 'none' },
  { stageKey: 'update_baseline', stageIndex: 2, label: 'Update baseline', progressMode: 'bounded', resumeMode: 'none' },
  { stageKey: 'finalizing', stageIndex: 3, label: 'Finalize', progressMode: 'simple', resumeMode: 'none' },
];

export function buildPublishTaskScopeKey(scope: PublishTaskCreateInput['scope']): string {
  return `${scope.publishTarget}:${scope.environment}:${scope.publishType}`;
}

export function buildPublishTaskScope(scope: PublishTaskCreateInput['scope']): TaskScope {
  return { type: publishTaskScopeType, key: buildPublishTaskScopeKey(scope), snapshot: scope as unknown as Record<string, unknown> };
}

export function buildPublishTaskRunInput(input: PublishTaskCreateInput): TaskRunInput {
  return { taskType: publishTaskType, definitionVersion: publishTaskDefinitionVersion, scope: buildPublishTaskScope(input.scope), params: input.params as unknown as Record<string, unknown> };
}

export function assertPublishTaskRunInput(input: TaskRunInput): void {
  if (input.taskType !== publishTaskType) throw new Error(`Publish task definition cannot handle task type "${input.taskType}"`);
  if (input.definitionVersion !== publishTaskDefinitionVersion) throw new Error(`Publish task definition ${publishTaskDefinitionVersion} cannot handle definition version "${input.definitionVersion}"`);
  if (input.scope.type !== publishTaskScopeType) throw new Error(`Publish task definition requires scope type "${publishTaskScopeType}", got "${input.scope.type}"`);
}

export function readPublishTaskParams(input: TaskRunInput): PublishTaskParams {
  return input.params as PublishTaskParams;
}

export function buildPublishTaskStagePlan(): TaskStagePlan[] {
  return publishTaskStagePlans.map(stage => ({ ...stage }));
}

export function buildPublishTaskStageEntry(stage: TaskStageState): TaskStageEntry {
  return {
    stageKey: stage.stageKey,
    stageIndex: stage.stageIndex,
    progressMode: stage.progressMode,
    resumeMode: stage.resumeMode,
    total: null,
    selectionAnchor: stage.selectionAnchor,
  };
}

/*
 * ── Types ──────────────────────────────────────────
 */

const LOAD_CHUNK_SIZE = 1000;
const REMOTE_CHUNK_SIZE = 500;
const FULL_SCAN_TABLES: TableName[] = ['entities', 'entity_localizations', 'entity_relations', 'cards'];

type PlanAction = typeof PublishBatchRow.$inferSelect['action'];
type PlanEntry = { tableName: string; rowKey: string; action: PlanAction; rowHash: string | null; previousRowHash: string | null };

interface LoadingCtx {
  baselineRowHashes: Map<TableName, Map<string, string>> | undefined;
  previousManifestHash: string | null;
  previousRange: { buildMin: number; buildMax: number } | null;
  publishedAt: Date | null;
  totalRows: number;
  batchId: string;
  range: { buildMin: number; buildMax: number } | null;
  counts: { totalRowCount: number; changedRowCount: number; insertedRowCount: number; updatedRowCount: number; deletedRowCount: number; unchangedRowCount: number; cardRowCount: number; entityRowCount: number; localizationRowCount: number; relationRowCount: number };
  builds: number[];
  processed: number;
  stream: { publishTarget: string; environment: string; publishType: string };
  /** Full-scan cursor: (tableName → last cursor row). null = not started. undefined = table exhausted. */
  scanCursors?: Map<TableName, any>;
  tableTotals?: Record<TableName, number>;
  tableProcessed?: Record<TableName, number>;
  dryRun: boolean;
}

interface PublishCtx {
  batchId?: string;
  db: PublishDb;
  remoteDb?: any;
  pendingRowCount: number;
  loader?: LoadingCtx;
  /** Keyset cursor for applying_remote: (lastTableName, lastRowKey). null = start from beginning. */
  applyCursor?: { tableName: string; rowKey: string } | null;
  /** Number of rows applied so far (for progress). */
  appliedCount?: number;
  /** Publish stream lease state for the remote gate. */
  leaseHolderId?: string;
  leaseStream?: { publishTarget: string; environment: string; publishType: string };
  /** Reanchor state for update_baseline stage. */
  reanchor?: ReanchorState;
}

interface ReanchorState {
  manifest: Bun.CryptoHasher;
  builds: Set<number>;
  totalRowCount: number;
  completed: number;
  publishedAt: Date;
  target: { publishTarget: string; environment: string; publishType: string };
  scanCursors: Map<string, any | null>;
}

const publishCtxMap = new Map<string, PublishCtx>();

function getOrInitCtx(taskRunId: string): PublishCtx {
  let ctx = publishCtxMap.get(taskRunId);
  if (!ctx) { ctx = { db: getLocalDb() as unknown as PublishDb, pendingRowCount: 0 }; publishCtxMap.set(taskRunId, ctx); }
  return ctx;
}

export function countPublishLoadingBlocks(tableTotals?: Record<string, number>): number {
  if (!tableTotals) return 1;
  return FULL_SCAN_TABLES.reduce((total, tableName) => {
    const rowCount = Math.max(Number(tableTotals[tableName] ?? 0), 0);
    return total + Math.ceil(rowCount / LOAD_CHUNK_SIZE) + 1;
  }, 0);
}

function isLoadingScanComplete(loader: LoadingCtx): boolean {
  return FULL_SCAN_TABLES.every(tableName => loader.scanCursors?.get(tableName) === undefined);
}

/*
 * ── Plan helpers ──────────────────────────────────
 */

function addPlan(tableName: string, rowKey: string, curHash: string | null, prevHash: string | null, plans: PlanEntry[], counts: LoadingCtx['counts']): void {
  counts.totalRowCount += 1;
  if (tableName === 'cards') counts.cardRowCount += 1;
  else if (tableName === 'entities') counts.entityRowCount += 1;
  else if (tableName === 'entity_localizations') counts.localizationRowCount += 1;
  else if (tableName === 'entity_relations') counts.relationRowCount += 1;

  if (curHash != null && prevHash == null) {
    plans.push({ tableName, rowKey, action: 'insert', rowHash: curHash, previousRowHash: null });
    counts.insertedRowCount += 1;
    counts.changedRowCount += 1;
  } else if (curHash != null && prevHash != null && curHash !== prevHash) {
    plans.push({ tableName, rowKey, action: 'update', rowHash: curHash, previousRowHash: prevHash });
    counts.updatedRowCount += 1;
    counts.changedRowCount += 1;
  } else if (curHash != null && prevHash != null) {
    plans.push({ tableName, rowKey, action: 'unchanged', rowHash: curHash, previousRowHash: prevHash });
    counts.unchangedRowCount += 1;
  } else if (curHash == null) {
    plans.push({ tableName, rowKey, action: 'delete', rowHash: null, previousRowHash: prevHash });
    counts.deletedRowCount += 1;
    counts.changedRowCount += 1;
  }
}

async function flushPlans(db: PublishDb, batchId: string, plans: PlanEntry[]): Promise<void> {
  if (plans.length === 0) return;
  const now = new Date();
  const chunks = chunkValues(plans, 100);
  for (const chunk of chunks) {
    await db.insert(PublishBatchRow).values(chunk.map(p => ({
      batchId,
      tableName: p.tableName,
      rowKey: p.rowKey,
      rowHash: p.rowHash ?? '',
      previousRowHash: p.previousRowHash ?? null,
      action: p.action,
      status: p.action === 'unchanged' ? 'skipped' as const : 'pending' as const,
      error: null,
      createdAt: now,
      updatedAt: now,
      appliedAt: null,
    })));
  }
  plans.length = 0;
}

function segments(counts: LoadingCtx['counts']) {
  return [
    { name: 'cards', done: counts.cardRowCount, total: Math.max(counts.cardRowCount, 1) },
    { name: 'entities', done: counts.entityRowCount, total: Math.max(counts.entityRowCount, 1) },
    { name: 'localizations', done: counts.localizationRowCount, total: Math.max(counts.localizationRowCount, 1) },
    { name: 'relations', done: counts.relationRowCount, total: Math.max(counts.relationRowCount, 1) },
  ];
}

/*
 * ── Block generation ──────────────────────────────
 */

export function buildPublishTaskBlocks(stage: TaskStageState, taskRunId: string): TaskBlock[] {
  if (stage.stageKey === 'loading_snapshots') {
    const loader = publishCtxMap.get(taskRunId)?.loader;
    if (!loader) return [{ blockKey: 'load:run', effectModel: 'reconcilable', payload: { stageKey: 'loading_snapshots' } }];
    const n = countPublishLoadingBlocks(loader.tableTotals);
    return Array.from({ length: n }, (_, i) => ({
      blockKey: `load:chunk_${i + 1}`,
      effectModel: 'reconcilable' as const,
      payload: { stageKey: 'loading_snapshots', chunkIndex: i },
    }));
  }
  if (stage.stageKey === 'applying_remote') {
    const ctx = publishCtxMap.get(taskRunId);
    const pendingRowCount = ctx?.pendingRowCount ?? 0;
    if (ctx && pendingRowCount === 0) return [];
    const n = ctx ? Math.ceil(pendingRowCount / REMOTE_CHUNK_SIZE) : 1;
    if (n <= 1) return [{ blockKey: 'apply:run', effectModel: 'reconcilable', payload: { stageKey: 'applying_remote' } }];
    return Array.from({ length: n }, (_, i) => ({
      blockKey: `apply:chunk_${i + 1}`,
      effectModel: 'reconcilable' as const,
      payload: { stageKey: 'applying_remote', chunkIndex: i },
    }));
  }
  if (stage.stageKey === 'update_baseline') {
    const rs = publishCtxMap.get(taskRunId)?.reanchor;
    const n = rs ? Math.ceil(rs.totalRowCount / reanchorReadBatchSize) : 1;
    if (n <= 1) return [{ blockKey: 'reanchor:run', effectModel: 'atomic', payload: { stageKey: 'update_baseline' } }];
    return Array.from({ length: n }, (_, i) => ({
      blockKey: `reanchor:chunk_${i + 1}`,
      effectModel: 'atomic' as const,
      payload: { stageKey: 'update_baseline', chunkIndex: i },
    }));
  }
  return [{ blockKey: `${stage.stageKey}:run`, effectModel: 'reconcilable', payload: { stageKey: stage.stageKey } }];
}

/*
 * ── Block execution ───────────────────────────────
 */

export async function executePublishStageBlock(input: {
  run: TaskRunInput;
  stage: TaskStageState;
  block: TaskBlock;
  store: TaskExecuteStore;
  taskRunId: string;
}): Promise<void> {
  const stageKey = input.block.payload?.stageKey as string;

  if (stageKey === 'loading_snapshots') {
    await executeLoadingChunk(input);
    return;
  }
  if (stageKey === 'applying_remote') {
    await executeApplyChunk(input);
    return;
  }
  if (stageKey === 'update_baseline') {
    const { store, taskRunId } = input;
    const ctx = publishCtxMap.get(taskRunId);
    const rs = ctx?.reanchor;
    if (!rs) return;

    const tables: TableName[] = ['entities', 'entity_localizations', 'entity_relations', 'cards'];
    let tableName: TableName | null = null;
    for (const tn of tables) { if (rs.scanCursors.get(tn) !== undefined) { tableName = tn; break; } }
    if (!tableName) { return; }

    const db = getLocalDb() as unknown as PublishDb;
    const cursor = rs.scanCursors.get(tableName)!;

    // Load one chunk
    let rawRows: any[];
    if (tableName === 'entities') {
      rawRows = await db.select().from(LocalEntity)
        .where(cursor == null ? undefined : sql`(${LocalEntity.cardId}, ${LocalEntity.revisionHash}) > (${cursor.cardId}, ${cursor.revisionHash})`)
        .orderBy(asc(LocalEntity.cardId), asc(LocalEntity.revisionHash)).limit(reanchorReadBatchSize) as any[];
    } else if (tableName === 'entity_localizations') {
      rawRows = await db.select().from(LocalEntityLocalization)
        .where(cursor == null ? undefined : sql`(${LocalEntityLocalization.cardId}, ${LocalEntityLocalization.lang}, ${LocalEntityLocalization.revisionHash}, ${LocalEntityLocalization.localizationHash}) > (${cursor.cardId}, ${cursor.lang}, ${cursor.revisionHash}, ${cursor.localizationHash})`)
        .orderBy(asc(LocalEntityLocalization.cardId), asc(LocalEntityLocalization.lang), asc(LocalEntityLocalization.revisionHash), asc(LocalEntityLocalization.localizationHash)).limit(reanchorReadBatchSize) as any[];
    } else if (tableName === 'entity_relations') {
      rawRows = await db.select().from(LocalEntityRelation)
        .where(cursor == null ? undefined : sql`(${LocalEntityRelation.sourceId}, ${LocalEntityRelation.relation}, ${LocalEntityRelation.targetId}, ${LocalEntityRelation.sourceRevisionHash}) > (${cursor.sourceId}, ${cursor.relation}, ${cursor.targetId}, ${cursor.sourceRevisionHash})`)
        .orderBy(asc(LocalEntityRelation.sourceId), asc(LocalEntityRelation.relation), asc(LocalEntityRelation.targetId), asc(LocalEntityRelation.sourceRevisionHash)).limit(reanchorReadBatchSize) as any[];
    } else {
      rawRows = await db.select().from(LocalCard)
        .where(cursor == null ? undefined : sql`(${LocalCard.cardId}) > (${cursor.cardId})`)
        .orderBy(asc(LocalCard.cardId)).limit(reanchorReadBatchSize) as any[];
    }

    if (rawRows.length > 0) {

    const baselineRows = rawRows.map((row: any) => {
      const rowKey = rowKeyOf(row, tableName);
      const rowHash = rowHashOf(row, tableName);
      rs.manifest.update(buildManifestLine({ tableName, rowKey, rowHash }));
      if (tableName === 'entities' && row.version) (row.version as number[]).forEach(v => rs.builds.add(v));
      return { publishTarget: rs.target.publishTarget, environment: rs.target.environment, publishType: rs.target.publishType, tableName, rowKey, rowHash, publishedAt: rs.publishedAt, createdAt: rs.publishedAt, updatedAt: rs.publishedAt };
    });

    await db.insert(PublishRowBaseline).values(baselineRows);

    rs.scanCursors.set(tableName, rawRows[rawRows.length - 1]);
    rs.completed += rawRows.length;
    store.updateStage(taskRunId, 'update_baseline', { done: rs.completed, total: rs.totalRowCount }).catch(() => {});

    } else {
      rs.scanCursors.set(tableName, undefined!);
    }

    return;
  }
  if (stageKey === 'finalizing') {
    const ctx = publishCtxMap.get(input.taskRunId);
    if (!ctx) return;
    const loader = ctx.loader;
    if (loader) {
      const c = loader.counts;
      console.log(`[publish done] dryRun=${loader.dryRun} total=${c.totalRowCount} insert=${c.insertedRowCount} update=${c.updatedRowCount} delete=${c.deletedRowCount} unchanged=${c.unchangedRowCount} | entities=${c.entityRowCount} localizations=${c.localizationRowCount} relations=${c.relationRowCount} cards=${c.cardRowCount}`);
    }

    // Pre-compute shared values used by both local and remote transactions.
    const localDb = getLocalDb() as unknown as PublishDb;
    const batch = ctx.batchId
      ? await localDb.select().from(PublishBatch).where(eq(PublishBatch.id, ctx.batchId)).then(r => r[0] ?? null)
      : null;
    const publishedAt = new Date();
    const range = batch && loader
      ? await derivePublishDatasetRange(localDb, [loader.builds], loader.previousRange)
      : null;
    const totalRowCount = loader && batch ? loader.counts.totalRowCount : (batch?.totalRowCount ?? 0);

    // 1. Count validation — read-only, before any writes.
    // Create a temporary remote connection if applying_remote didn't run any blocks.
    if (ctx.batchId && batch) {
      const remoteDb = ctx.remoteDb ?? createDb(requireHearthstonePublishTargetByIdentity(batch.publishTarget, batch.environment).connectionString) as any;
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
            throw new Error(`[publish finalize] row count mismatch for ${tableName}: local=${localRow!.count} remote=${remoteRow!.count}`);
          }
        }
      } finally {
        // Close the temporary connection if we created one here.
        if (!ctx.remoteDb) {
          await remoteDb.$client.end({ timeout: 1 });
        }
      }

      // 2. Remote transaction: update ledger + release lease atomically.
      if (ctx.remoteDb) {
        const remoteDb = ctx.remoteDb as any;
        await remoteDb.transaction(async (tx: any) => {
          await upsertRemotePublishLedger(tx, {
            batchId: batch.id,
            publishTarget: batch.publishTarget,
            environment: batch.environment,
            targetFingerprint: batch.targetFingerprint,
            publishType: batch.publishType,
            range: { buildMin: batch.buildMin, buildMax: batch.buildMax },
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

          if (ctx.leaseHolderId != null && ctx.leaseStream != null) {
            await tx.update(PublishStreamRegistration)
              .set({
                leaseHolderId: null,
                leaseExpiresAt: null,
                updatedAt: new Date(),
              })
              .where(and(
                eq(PublishStreamRegistration.publishTarget, ctx.leaseStream.publishTarget),
                eq(PublishStreamRegistration.environment, ctx.leaseStream.environment),
                eq(PublishStreamRegistration.publishType, ctx.leaseStream.publishType),
                eq(PublishStreamRegistration.leaseHolderId, ctx.leaseHolderId),
              ));
            ctx.leaseHolderId = undefined;
            ctx.leaseStream = undefined;
          }
        });
      }
    }

    // 3. Local transaction: PublishBaseline + PublishBatch completion atomically.
    if (ctx.batchId && batch) {
      await localDb.transaction(async (tx) => {
        const finalRange = range ?? { buildMin: batch.buildMin, buildMax: batch.buildMax };

        await tx.insert(PublishBaseline).values({
          publishTarget: batch.publishTarget,
          environment: batch.environment,
          publishType: batch.publishType,
          targetFingerprint: batch.targetFingerprint,
          batchId: ctx.batchId!,
          buildMin: finalRange.buildMin,
          buildMax: finalRange.buildMax,
          generationFingerprint: publishCardDataGeneration.fingerprint,
          generationOrder: publishCardDataGeneration.order,
          manifestHash: batch.manifestHash,
          totalRowCount,
          publishedAt,
          createdAt: publishedAt,
          updatedAt: publishedAt,
        }).onConflictDoUpdate({
          target: [PublishBaseline.publishTarget, PublishBaseline.environment, PublishBaseline.publishType],
          set: {
            batchId: ctx.batchId!,
            buildMin: finalRange.buildMin,
            buildMax: finalRange.buildMax,
            generationFingerprint: publishCardDataGeneration.fingerprint,
            generationOrder: publishCardDataGeneration.order,
            manifestHash: batch.manifestHash,
            totalRowCount,
            publishedAt,
            updatedAt: publishedAt,
          } as any,
        });

        const summary = {
          batchId: batch.id,
          publishTarget: batch.publishTarget,
          environment: batch.environment,
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
          publishedAt: publishedAt.toISOString(),
        };
        await tx.update(PublishBatch)
          .set({ status: 'completed' as any, completedAt: publishedAt as any, updatedAt: publishedAt, summary: summary as any })
          .where(eq(PublishBatch.id, ctx.batchId!));
      });

      // 4. Old PublishBatchRow cleanup (outside the local txn, lightweight).
      const oldBatchIds = await localDb.select({ id: PublishBatch.id })
        .from(PublishBatch)
        .where(and(
          eq(PublishBatch.publishTarget, batch.publishTarget),
          eq(PublishBatch.environment, batch.environment),
          eq(PublishBatch.publishType, batch.publishType),
          eq(PublishBatch.status, 'completed'),
          ne(PublishBatch.id, ctx.batchId!),
        ))
        .then(rows => rows.map(r => r.id));
      if (oldBatchIds.length > 0) {
        await localDb.delete(PublishBatchRow)
          .where(inArray(PublishBatchRow.batchId, oldBatchIds));
      }
    }
    publishCtxMap.delete(input.taskRunId);
    return;
  }
}

/*
 * ── Loading snapshots ─────────────────────────────
 */

async function executeLoadingChunk(
  input: { run: TaskRunInput; stage: TaskStageState; block: TaskBlock; store: TaskExecuteStore; taskRunId: string },
): Promise<void> {
  const { store, taskRunId } = input;
  const ctx = publishCtxMap.get(taskRunId);
  const loader = ctx?.loader;
  if (!loader) return;

  const plans: PlanEntry[] = [];

  await processFullScanChunk(input, loader, plans);

  if (!loader.dryRun) {
    await flushPlans(getLocalDb() as unknown as PublishDb, loader.batchId, plans);
  }

  if (isLoadingScanComplete(loader)) {
    const finalTotal = loader.processed;
    if (loader.dryRun) {
      const c = loader.counts;
      store.updateStage(taskRunId, 'loading_snapshots', {
        done: finalTotal, total: finalTotal,
        segments: [
          { name: 'insert', done: c.insertedRowCount, total: Math.max(c.insertedRowCount, 1) },
          { name: 'update', done: c.updatedRowCount, total: Math.max(c.updatedRowCount, 1) },
          { name: 'delete', done: c.deletedRowCount, total: Math.max(c.deletedRowCount, 1) },
          { name: 'unchanged', done: c.unchangedRowCount, total: Math.max(c.unchangedRowCount, 1) },
          { name: 'entities', done: c.entityRowCount, total: Math.max(c.entityRowCount, 1) },
          { name: 'localizations', done: c.localizationRowCount, total: Math.max(c.localizationRowCount, 1) },
          { name: 'cards', done: c.cardRowCount, total: Math.max(c.cardRowCount, 1) },
        ],
      }).catch(() => {});
    } else {
      const db = getLocalDb() as unknown as PublishDb;

      // Build manifest from non-delete batch rows
      const manifestRows = await db.select({
        tableName: PublishBatchRow.tableName,
        rowKey: PublishBatchRow.rowKey,
        rowHash: PublishBatchRow.rowHash,
      })
        .from(PublishBatchRow)
        .where(and(eq(PublishBatchRow.batchId, loader.batchId), ne(PublishBatchRow.action, 'delete')))
        .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowKey));

      const manifestHash = hashJson(manifestRows.map(r => ({
        tableName: r.tableName,
        rowKey: r.rowKey,
        rowHash: r.rowHash,
      })).sort((a, b) => a.tableName.localeCompare(b.tableName) || a.rowKey.localeCompare(b.rowKey)));

      const range = await derivePublishDatasetRange(db, [loader.builds], loader.previousRange);

      const localDb = getLocalDb();
      await localDb.update(PublishBatch)
        .set({
          operationKind: 'publish' as any,
          buildMin: range.buildMin,
          buildMax: range.buildMax,
          generationFingerprint: publishCardDataGeneration.fingerprint,
          generationOrder: publishCardDataGeneration.order,
          manifestHash,
          previousManifestHash: loader.previousManifestHash,
          totalRowCount: loader.counts.totalRowCount,
          changedRowCount: loader.counts.changedRowCount,
          insertedRowCount: loader.counts.insertedRowCount,
          updatedRowCount: loader.counts.updatedRowCount,
          deletedRowCount: loader.counts.deletedRowCount,
          unchangedRowCount: loader.counts.unchangedRowCount,
          updatedAt: new Date(),
        })
        .where(eq(PublishBatch.id, loader.batchId));

      const [pendingRow] = await db.select({ count: count() }).from(PublishBatchRow)
        .where(and(eq(PublishBatchRow.batchId, loader.batchId), eq(PublishBatchRow.status, 'pending')));
      const pctx = getOrInitCtx(taskRunId);
      pctx.batchId = loader.batchId;
      pctx.pendingRowCount = Number(pendingRow!.count);

      store.updateStage(taskRunId, 'loading_snapshots', {
        done: finalTotal, total: finalTotal,
        segments: segments(loader.counts),
      }).catch(() => {});
    }

    return;
  }

  store.updateStage(taskRunId, 'loading_snapshots', {
    done: loader.processed, total: loader.totalRows,
    segments: loader.tableTotals && loader.tableProcessed
      ? Object.entries(loader.tableTotals).map(([name, total]) => ({
          name,
          done: loader.tableProcessed![name as TableName]! ?? 0,
          total,
        }))
      : segments(loader.counts),
  }).catch(() => {});
}

async function processFullScanChunk(
  input: { run: TaskRunInput; stage: TaskStageState; block: TaskBlock; store: TaskExecuteStore; taskRunId: string },
  loader: LoadingCtx,
  plans: PlanEntry[],
): Promise<void> {
  const db = getLocalDb() as unknown as PublishDb;
  const cursors = loader.scanCursors!;

  // Find active table
  let tableName: TableName | null = null;
  for (const tn of FULL_SCAN_TABLES) { if (cursors.get(tn) !== undefined) { tableName = tn; break; } }
  if (!tableName) return;

  // Check for task cancellation before processing this chunk.
  const [task] = await db.select({ status: TaskRun.status, controlRequestKind: TaskRun.controlRequestKind })
    .from(TaskRun)
    .where(eq(TaskRun.id, input.taskRunId));
  if (task && (task.status === 'canceling' || task.controlRequestKind === 'cancel')) {
    throw new Error('发布已取消');
  }

  const cursor = cursors.get(tableName)!;
  let rawRows: any[];

  const since = loader.publishedAt;
  if (tableName === 'entities') {
    const tbl = LocalBaseEntity;
    rawRows = await db.select().from(tbl)
      .where(and(
        since
          ? or(
              and(sql`${tbl.deletedAt} is null`, or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))),
              gt(tbl.deletedAt, since),
            )
          : sql`${tbl.deletedAt} is null`,
        cursor == null ? undefined : sql`(${tbl.cardId}, ${tbl.revisionHash}) > (${cursor.cardId}, ${cursor.revisionHash})`,
      ))
      .orderBy(asc(tbl.cardId), asc(tbl.revisionHash)).limit(LOAD_CHUNK_SIZE) as any[];
  } else if (tableName === 'entity_localizations') {
    const tbl = LocalBaseEntityLocalization;
    rawRows = await db.select().from(tbl)
      .where(and(
        since
          ? or(
              and(sql`${tbl.deletedAt} is null`, or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))),
              gt(tbl.deletedAt, since),
            )
          : sql`${tbl.deletedAt} is null`,
        cursor == null ? undefined : sql`(${tbl.cardId}, ${tbl.lang}, ${tbl.revisionHash}, ${tbl.localizationHash}) > (${cursor.cardId}, ${cursor.lang}, ${cursor.revisionHash}, ${cursor.localizationHash})`,
      ))
      .orderBy(asc(tbl.cardId), asc(tbl.lang), asc(tbl.revisionHash), asc(tbl.localizationHash)).limit(LOAD_CHUNK_SIZE) as any[];
  } else if (tableName === 'entity_relations') {
    const tbl = LocalBaseEntityRelation;
    rawRows = await db.select().from(tbl)
      .where(and(
        since
          ? or(
              and(sql`${tbl.deletedAt} is null`, or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))),
              gt(tbl.deletedAt, since),
            )
          : sql`${tbl.deletedAt} is null`,
        cursor == null ? undefined : sql`(${tbl.sourceId}, ${tbl.relation}, ${tbl.targetId}, ${tbl.sourceRevisionHash}) > (${cursor.sourceId}, ${cursor.relation}, ${cursor.targetId}, ${cursor.sourceRevisionHash})`,
      ))
      .orderBy(asc(tbl.sourceId), asc(tbl.relation), asc(tbl.targetId), asc(tbl.sourceRevisionHash)).limit(LOAD_CHUNK_SIZE) as any[];
  } else {
    const tbl = LocalBaseCard;
    rawRows = await db.select().from(tbl)
      .where(and(
        since
          ? or(
              and(sql`${tbl.deletedAt} is null`, or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))),
              gt(tbl.deletedAt, since),
            )
          : sql`${tbl.deletedAt} is null`,
        cursor == null ? undefined : sql`(${tbl.cardId}) > (${cursor.cardId ?? cursor})`,
      ))
      .orderBy(asc(tbl.cardId)).limit(LOAD_CHUNK_SIZE) as any[];
  }

  if (rawRows.length === 0) { cursors.set(tableName, undefined!); return; }

  const buildsSet = new Set<number>(loader.builds);
  for (const row of rawRows) {
    const rowKey = rowKeyOf(row, tableName);
    const isDeleted = row.deletedAt != null;
    const hash = isDeleted ? null : rowHashOf(row, tableName);
    const prevHash = loader.baselineRowHashes?.get(tableName as TableName)?.get(rowKey) ?? null;
    addPlan(tableName, rowKey, hash, prevHash, plans, loader.counts);
    if (!isDeleted && tableName !== 'cards' && row.version) {
      (row.version as number[]).forEach(v => buildsSet.add(v));
    }
  }

  cursors.set(tableName, rawRows[rawRows.length - 1]);
  loader.builds = [...buildsSet];
  loader.processed += rawRows.length;
  if (loader.tableProcessed) loader.tableProcessed[tableName]! += rawRows.length;
}

/*
 * ── Applying remote ───────────────────────────────
 */

async function executeApplyChunk(
  input: { run: TaskRunInput; stage: TaskStageState; block: TaskBlock; store: TaskExecuteStore; taskRunId: string },
): Promise<void> {
  const { store, taskRunId } = input;
  const ctx = publishCtxMap.get(taskRunId);
  if (!ctx) throw new Error('Publish context not found for task ' + taskRunId);

  // Check for task cancellation before processing this chunk.
  const [task] = await ctx.db.select({ status: TaskRun.status, controlRequestKind: TaskRun.controlRequestKind })
    .from(TaskRun)
    .where(eq(TaskRun.id, taskRunId));
  if (task && (task.status === 'canceling' || task.controlRequestKind === 'cancel')) {
    throw new Error('发布已取消');
  }

  const scope = (input.run.scope.snapshot as any);
  const chunkIndex = (input.block.payload?.chunkIndex as number) ?? 0;

  // Keyset pagination — load only this chunk's rows
  const cursor = ctx.applyCursor;
  const whereClauses = [eq(PublishBatchRow.batchId, ctx.batchId!), eq(PublishBatchRow.status, 'pending')];
  if (cursor) {
    whereClauses.push(or(
      gt(PublishBatchRow.tableName, cursor.tableName),
      and(eq(PublishBatchRow.tableName, cursor.tableName), gt(PublishBatchRow.rowKey, cursor.rowKey)),
    )!);
  }
  const chunk = await ctx.db.select()
    .from(PublishBatchRow)
    .where(and(...whereClauses))
    .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowKey))
    .limit(REMOTE_CHUNK_SIZE);
  if (chunk.length === 0) return;

  // Save cursor for next chunk
  const lastRow = chunk[chunk.length - 1]!;
  ctx.applyCursor = { tableName: lastRow.tableName, rowKey: lastRow.rowKey };

  // Create remote DB on first block
  if (!ctx.remoteDb) {
    ctx.remoteDb = createDb(requireHearthstonePublishTargetByIdentity(scope?.publishTarget ?? 'hearthstone', scope?.environment ?? '').connectionString);
    store.updateStage(taskRunId, 'applying_remote', { total: ctx.pendingRowCount, done: 0 }).catch(() => {});

    // Validate remote gate and acquire publish stream lease.
    const batch = await ctx.db.select()
      .from(PublishBatch)
      .where(eq(PublishBatch.id, ctx.batchId!))
      .then(rows => rows[0] ?? null);
    if (!batch) throw new Error(`Publish batch ${ctx.batchId} not found for remote gate check.`);
    const remoteDb = ctx.remoteDb as any;
    await assertRemotePublishGate(remoteDb, {
      publishTarget: batch.publishTarget,
      environment: batch.environment,
      publishType: batch.publishType,
      targetFingerprint: batch.targetFingerprint,
      manifestHash: batch.manifestHash,
      previousManifestHash: batch.previousManifestHash ?? null,
      buildMax: batch.buildMax,
      generationFingerprint: batch.generationFingerprint,
      generationOrder: batch.generationOrder,
      leaseHolderId: ctx.batchId!,
    });
    ctx.leaseHolderId = ctx.batchId;
    ctx.leaseStream = {
      publishTarget: batch.publishTarget,
      environment: batch.environment,
      publishType: batch.publishType,
    };
  }

  const byTable = new Map<string, typeof chunk>();
  for (const row of chunk) {
    if (!byTable.has(row.tableName)) byTable.set(row.tableName, []);
    byTable.get(row.tableName)!.push(row);
  }

  const rowDataMap = new Map<string, unknown>();
  for (const [tableName, rows] of byTable) {
    const keySet = [...new Set(rows.map(r => r.rowKey))];
    const data = await loadRowDataChunk(ctx.db, tableName as TableName, keySet);
    for (const [pk, d] of data) rowDataMap.set(`${tableName}:${pk}`, d);
  }

  const remoteDb = ctx.remoteDb as any;
  try {
    await remoteDb.transaction(async (tx: any) => {
      for (const row of chunk) {
        try {
          const tn = row.tableName as TableName;
          const rd = rowDataMap.get(`${tn}:${row.rowKey}`);
          if (rd == null && row.action !== 'delete') throw new Error(`Row data not found`);
          if (row.action === 'insert') await insertRemoteRow(tx, tn, rd, 'insert');
          else if (row.action === 'update') {
            if (tn !== 'cards') await deleteRemoteRow(tx, tn, parseRowKey(row.rowKey));
            await insertRemoteRow(tx, tn, rd, 'update');
          } else if (row.action === 'delete') await deleteRemoteRow(tx, tn, parseRowKey(row.rowKey));
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          throw new Error(`行应用失败: ${row.tableName} ${row.rowKey} — ${msg}`);
        }
      }
    });

    // Extend the remote publish lease after each successful chunk transaction.
    if (ctx.leaseHolderId != null && ctx.leaseStream != null) {
      await renewRemotePublishLease(ctx.remoteDb as any, {
        publishTarget: ctx.leaseStream.publishTarget,
        environment: ctx.leaseStream.environment,
        publishType: ctx.leaseStream.publishType,
        leaseHolderId: ctx.leaseHolderId,
      });
    }

    for (const row of chunk) {
      await ctx.db.update(PublishBatchRow)
        .set({ status: row.action === 'unchanged' ? 'skipped' : 'applied', updatedAt: new Date(), appliedAt: new Date() })
        .where(and(eq(PublishBatchRow.batchId, ctx.batchId!), eq(PublishBatchRow.tableName, row.tableName as any), eq(PublishBatchRow.rowKey, row.rowKey)));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.db.update(PublishBatch)
      .set({ error: msg, updatedAt: new Date() })
      .where(eq(PublishBatch.id, ctx.batchId!));
    throw error;
  }

  ctx.appliedCount = (ctx.appliedCount ?? 0) + chunk.length;
  store.updateStage(taskRunId, 'applying_remote', { done: ctx.appliedCount, total: ctx.pendingRowCount }).catch(() => {});
}

/*
 * ── Task definition ───────────────────────────────
 */

export const publishTaskDefinition: TaskDefinition = {
  taskType: publishTaskType,
  definitionVersion: publishTaskDefinitionVersion,
  supportsResume: false,
  effectModel: 'reconcilable',
  buildStagePlan(input) {
    assertPublishTaskRunInput(input);
    const stages = buildPublishTaskStagePlan();
    if (readPublishTaskParams(input).dryRun) {
      return stages.filter(s => s.stageKey === 'loading_snapshots' || s.stageKey === 'finalizing');
    }
    return stages;
  },
  async prepareStageEntry({ stage, run, taskRunId }) {
    if (stage.stageKey === 'loading_snapshots') {
      const scope = (run.scope.snapshot ?? {}) as any;
      const resolvedTarget = requireHearthstonePublishTargetByIdentity(scope.publishTarget ?? 'hearthstone', scope.environment ?? '');
      const stream = { publishTarget: resolvedTarget.publishTarget, environment: resolvedTarget.environment, publishType: 'card_data', targetFingerprint: resolvedTarget.targetFingerprint };
      const db = getLocalDb();
      const { baseline, baselineRowHashes } = await loadBaselineRowHashes(db, stream);

      const dryRun = (run.params as any)?.dryRun === true;

      // Auto-resume: detect an incomplete publish batch and continue from where it left off.
      if (!dryRun) {
        const incomplete = await db.select()
          .from(PublishBatch)
          .where(and(
            eq(PublishBatch.status, 'applying'),
            eq(PublishBatch.publishTarget, stream.publishTarget),
            eq(PublishBatch.environment, stream.environment),
            eq(PublishBatch.publishType, stream.publishType),
            eq(PublishBatch.operationKind, 'publish'),
          ))
          .orderBy(desc(PublishBatch.createdAt))
          .then(rows => rows[0] ?? null);

        if (incomplete) {
          const [pendingRow] = await db.select({ count: count() })
            .from(PublishBatchRow)
            .where(and(
              eq(PublishBatchRow.batchId, incomplete.id),
              eq(PublishBatchRow.status, 'pending'),
            ));
          const pendingCount = Number(pendingRow!.count);

          if (pendingCount > 0) {
            const pctx = getOrInitCtx(taskRunId);
            pctx.batchId = incomplete.id;
            pctx.pendingRowCount = pendingCount;

            return { ...buildPublishTaskStageEntry(stage), total: 0 };
          }
        }
      }

      const active = await findActiveStreamBatch(db, stream);
      if (active) {
        throw new Error(`当前 publish stream 已有未完成批次 ${active.id} (${active.operationKind})，请先完成或停止后再开始新的操作。`);
      }

      const publishedAt = baseline?.publishedAt ?? null;
      const isIncremental = publishedAt != null;
      const since = publishedAt!;
      type BaseTable = typeof LocalBaseEntity | typeof LocalBaseEntityLocalization | typeof LocalBaseEntityRelation | typeof LocalBaseCard;
      const incrementalSinceFilter = (tbl: BaseTable) =>
        or(
          and(isNull(tbl.deletedAt), or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))),
          gt(tbl.deletedAt, since),
        );
      const fullScanFilter = (tbl: BaseTable) => isNull(tbl.deletedAt);
      const cnt = await Promise.all([
        isIncremental
          ? db.select({ count: count() }).from(LocalBaseEntity).where(incrementalSinceFilter(LocalBaseEntity))
          : db.select({ count: count() }).from(LocalBaseEntity).where(fullScanFilter(LocalBaseEntity)),
        isIncremental
          ? db.select({ count: count() }).from(LocalBaseEntityLocalization).where(incrementalSinceFilter(LocalBaseEntityLocalization))
          : db.select({ count: count() }).from(LocalBaseEntityLocalization).where(fullScanFilter(LocalBaseEntityLocalization)),
        isIncremental
          ? db.select({ count: count() }).from(LocalBaseEntityRelation).where(incrementalSinceFilter(LocalBaseEntityRelation))
          : db.select({ count: count() }).from(LocalBaseEntityRelation).where(fullScanFilter(LocalBaseEntityRelation)),
        isIncremental
          ? db.select({ count: count() }).from(LocalBaseCard).where(incrementalSinceFilter(LocalBaseCard))
          : db.select({ count: count() }).from(LocalBaseCard).where(fullScanFilter(LocalBaseCard)),
      ]);
      const total = cnt.reduce((s, r) => s + Number(r[0]!.count), 0);
      const tableTotals: Record<string, number> = { entities: Number(cnt[0]![0]!.count), 'entity_localizations': Number(cnt[1]![0]!.count), 'entity_relations': Number(cnt[2]![0]!.count), cards: Number(cnt[3]![0]!.count) };
      let batchId = dryRun ? randomUUID() : '';
      if (!dryRun) {
        const [created] = await db.insert(PublishBatch).values({
          publishTarget: stream.publishTarget,
          environment: stream.environment,
          targetFingerprint: stream.targetFingerprint,
          publishType: 'card_data',
          operationKind: 'publish',
          buildMin: 1,
          buildMax: 1,
          generationFingerprint: publishCardDataGeneration.fingerprint,
          generationOrder: publishCardDataGeneration.order,
          manifestHash: '',
          previousManifestHash: baseline?.manifestHash ?? null,
          status: 'applying',
          startedAt: new Date(),
        }).returning({ id: PublishBatch.id });
        batchId = created!.id;
      }
      const loader: LoadingCtx = {
        baselineRowHashes, previousManifestHash: baseline?.manifestHash ?? null,
        previousRange: baseline ? { buildMin: baseline.buildMin, buildMax: baseline.buildMax } : null,
        publishedAt,
        totalRows: total, batchId, range: null,
        counts: { totalRowCount: 0, changedRowCount: 0, insertedRowCount: 0, updatedRowCount: 0, deletedRowCount: 0, unchangedRowCount: 0, cardRowCount: 0, entityRowCount: 0, localizationRowCount: 0, relationRowCount: 0 },
        builds: [], processed: 0,
        stream,
        scanCursors: new Map([['entities', null], ['entity_localizations', null], ['entity_relations', null], ['cards', null]]),
        tableTotals,
        tableProcessed: tableTotals ? { entities: 0, entity_localizations: 0, entity_relations: 0, cards: 0 } : undefined,
        dryRun,
      };
      const pctx = getOrInitCtx(taskRunId);
      pctx.batchId = batchId;
      pctx.loader = loader;

      return { ...buildPublishTaskStageEntry(stage), total };
    }
    if (stage.stageKey === 'applying_remote') {
      const ctx = publishCtxMap.get(taskRunId);
      if (ctx?.batchId != null) {
        const [pendingRow] = await getLocalDb().select({ count: count() }).from(PublishBatchRow)
          .where(and(eq(PublishBatchRow.batchId, ctx.batchId), eq(PublishBatchRow.status, 'pending')));
        ctx.pendingRowCount = Number(pendingRow!.count);
      }

      return { ...buildPublishTaskStageEntry(stage), total: publishCtxMap.get(taskRunId)?.pendingRowCount ?? 0 };
    }
    if (stage.stageKey === 'update_baseline') {
      const scope = (run.scope.snapshot ?? {}) as any;
      const target = { publishTarget: scope?.publishTarget ?? 'hearthstone', environment: scope?.environment ?? '' };
      const db = getLocalDb() as unknown as PublishDb;
      const ctx = publishCtxMap.get(taskRunId);

      if (ctx?.batchId == null) {
        throw new Error('Publish batch is not prepared before baseline update.');
      }

      const [pendingRow] = await db.select({ count: count() }).from(PublishBatchRow)
        .where(and(eq(PublishBatchRow.batchId, ctx.batchId), eq(PublishBatchRow.status, 'pending')));
      const pendingRowCount = Number(pendingRow!.count);
      if (pendingRowCount > 0) {
        throw new Error(`Publish batch ${ctx.batchId} still has ${pendingRowCount} pending remote rows before baseline update.`);
      }

      const counts = await loadReanchorRowCounts(db);
      await db.delete(PublishRowBaseline)
        .where(and(eq(PublishRowBaseline.publishTarget, target.publishTarget), eq(PublishRowBaseline.environment, target.environment), eq(PublishRowBaseline.publishType, 'card_data')));

      const rs: ReanchorState = {
        manifest: new Bun.CryptoHasher('sha256'),
        builds: new Set(),
        totalRowCount: counts.totalRowCount,
        completed: 0,
        publishedAt: new Date(),
        target: { ...target, publishType: 'card_data' },
        scanCursors: new Map([['entities', null], ['entity_localizations', null], ['entity_relations', null], ['cards', null]]),
      };
      getOrInitCtx(taskRunId).reanchor = rs;

      return { ...buildPublishTaskStageEntry(stage), total: counts.totalRowCount };
    }
    return buildPublishTaskStageEntry(stage);
  },
  buildBlocks({ stage, taskRunId }) { return buildPublishTaskBlocks(stage, taskRunId); },
  async executeBlock(input) {
    await executePublishStageBlock(input);
  },
};
