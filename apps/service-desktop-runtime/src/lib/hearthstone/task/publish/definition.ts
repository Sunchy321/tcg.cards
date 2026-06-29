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
import { and, eq, ne, or, asc, count, gt, inArray, sql } from 'drizzle-orm';

// const TEST_BUILD = 245096;
import { createDb } from '@tcg-cards/db';
import { PublishBaseline, PublishRowBaseline, PublishRowChangeLog, PublishBatchRow, PublishBatch, SourceVersion } from '@tcg-cards/db/schema/local/hearthstone';
import { Entity as LocalEntity, EntityLocalization as LocalEntityLocalization, EntityRelation as LocalEntityRelation, Card as LocalCard } from '@tcg-cards/db/schema/local/hearthstone';
import { loadRowDataChunk, insertRemoteRow, deleteRemoteRow, parseRowKey, loadReanchorRowCounts, reanchorReadBatchSize, buildManifestLine } from '../../hsdata-publish';
import { hashJson, derivePublishDatasetRange, rowKeyOf, rowHashOf, loadBaselineRowHashes, loadChunkDataAndHash, chunkValues } from '../../hsdata-publish';
import type { TableName, PublishDb } from '../../hsdata-publish';
import { requireHearthstonePublishTargetByIdentity } from '../../hsdata-publish-target';
import { PublishJobInterruptedError } from '../../hsdata-publish-progress';
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

type PlanAction = typeof PublishBatchRow.$inferSelect['action'];
type PlanEntry = { tableName: string; rowKey: string; action: PlanAction; rowHash: string | null; previousRowHash: string | null };

interface LoadingCtx {
  baselineRowHashes: Map<TableName, Map<string, string>> | undefined;
  previousManifestHash: string | null;
  publishedAt: Date | null;
  totalRows: number;
  isChangelog: boolean;
  batchId: string;
  range: { sourceTagMin: number; sourceTagMax: number; buildMin: number; buildMax: number } | null;
  counts: { totalRowCount: number; changedRowCount: number; insertedRowCount: number; updatedRowCount: number; deletedRowCount: number; unchangedRowCount: number; cardRowCount: number; entityRowCount: number; localizationRowCount: number; relationRowCount: number };
  builds: number[];
  touchedKeys: Set<string>;
  processed: number;
  stream: { publishTarget: string; environment: string; publishType: string };
  /** Full-scan cursor: (tableName → last cursor value). null = not started. undefined = table exhausted. */
  scanCursors?: Map<TableName, string | null>;
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
  } else if (curHash == null && prevHash != null) {
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
    const n = Math.ceil(loader.totalRows / LOAD_CHUNK_SIZE) + 4;
    if (n <= 1) return [{ blockKey: 'load:run', effectModel: 'reconcilable', payload: { stageKey: 'loading_snapshots', chunkIndex: 0 } }];
    return Array.from({ length: n }, (_, i) => ({
      blockKey: `load:chunk_${i + 1}`,
      effectModel: 'reconcilable' as const,
      payload: { stageKey: 'loading_snapshots', chunkIndex: i },
    }));
  }
  if (stage.stageKey === 'applying_remote') {
    const ctx = publishCtxMap.get(taskRunId);
    const n = ctx ? Math.ceil(ctx.pendingRowCount / REMOTE_CHUNK_SIZE) : 1;
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
        .where(cursor == null ? undefined : or(gt(LocalEntity.cardId, cursor.cardId), and(eq(LocalEntity.cardId, cursor.cardId), gt(LocalEntity.revisionHash, cursor.revisionHash))))
        .orderBy(asc(LocalEntity.cardId), asc(LocalEntity.revisionHash)).limit(reanchorReadBatchSize) as any[];
    } else if (tableName === 'entity_localizations') {
      rawRows = await db.select().from(LocalEntityLocalization)
        .where(cursor == null ? undefined : or(gt(LocalEntityLocalization.cardId, cursor.cardId), and(eq(LocalEntityLocalization.cardId, cursor.cardId), gt(LocalEntityLocalization.lang, cursor.lang)), and(eq(LocalEntityLocalization.cardId, cursor.cardId), eq(LocalEntityLocalization.lang, cursor.lang), gt(LocalEntityLocalization.revisionHash, cursor.revisionHash)), and(eq(LocalEntityLocalization.cardId, cursor.cardId), eq(LocalEntityLocalization.lang, cursor.lang), eq(LocalEntityLocalization.revisionHash, cursor.revisionHash), gt(LocalEntityLocalization.localizationHash, cursor.localizationHash))))
        .orderBy(asc(LocalEntityLocalization.cardId), asc(LocalEntityLocalization.lang), asc(LocalEntityLocalization.revisionHash), asc(LocalEntityLocalization.localizationHash)).limit(reanchorReadBatchSize) as any[];
    } else if (tableName === 'entity_relations') {
      rawRows = await db.select().from(LocalEntityRelation)
        .where(cursor == null ? undefined : or(gt(LocalEntityRelation.sourceId, cursor.sourceId), and(eq(LocalEntityRelation.sourceId, cursor.sourceId), gt(LocalEntityRelation.relation, cursor.relation)), and(eq(LocalEntityRelation.sourceId, cursor.sourceId), eq(LocalEntityRelation.relation, cursor.relation), gt(LocalEntityRelation.targetId, cursor.targetId)), and(eq(LocalEntityRelation.sourceId, cursor.sourceId), eq(LocalEntityRelation.relation, cursor.relation), eq(LocalEntityRelation.targetId, cursor.targetId), gt(LocalEntityRelation.sourceRevisionHash, cursor.sourceRevisionHash))))
        .orderBy(asc(LocalEntityRelation.sourceId), asc(LocalEntityRelation.relation), asc(LocalEntityRelation.targetId), asc(LocalEntityRelation.sourceRevisionHash)).limit(reanchorReadBatchSize) as any[];
    } else {
      rawRows = await db.select().from(LocalCard)
        .where(cursor == null ? undefined : gt(LocalCard.cardId, cursor.cardId))
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

    // Finalize after all tables exhausted
    if (!tables.some(tn => rs.scanCursors.get(tn) !== undefined)) {
      const builds = [...rs.builds].sort((l, r) => l - r);
      const sourceVersionRows = await db.select({ sourceTag: SourceVersion.sourceTag, build: SourceVersion.build })
        .from(SourceVersion).where(and(inArray(SourceVersion.build, builds as any), eq(SourceVersion.status, 'completed' as any), eq(SourceVersion.projectionStatus, 'completed' as any)));
      const sourceTags = [...new Set(sourceVersionRows.filter(r => r.build != null).map(r => r.sourceTag))].sort((l, r) => l - r);
      const range = { sourceTagMin: sourceTags[0]!, sourceTagMax: sourceTags[sourceTags.length - 1]!, buildMin: builds[0]!, buildMax: builds[builds.length - 1]! };
      const manifestHash = rs.manifest.digest('hex') as string;

      await db.insert(PublishBaseline).values({
        publishTarget: rs.target.publishTarget, environment: rs.target.environment, publishType: rs.target.publishType,
        targetFingerprint: rs.target.publishTarget,
        batchId: ctx.batchId!,
        sourceTagMin: range.sourceTagMin, sourceTagMax: range.sourceTagMax, buildMin: range.buildMin, buildMax: range.buildMax,
        generationFingerprint: 'draft' as any, generationOrder: 1 as any,
        manifestHash, totalRowCount: rs.totalRowCount, publishedAt: rs.publishedAt,
      } as any)
        .onConflictDoUpdate({ target: [PublishBaseline.publishTarget, PublishBaseline.environment, PublishBaseline.publishType], set: {
          batchId: ctx.batchId!,
          sourceTagMin: range.sourceTagMin, sourceTagMax: range.sourceTagMax, buildMin: range.buildMin, buildMax: range.buildMax,
          manifestHash, totalRowCount: rs.totalRowCount, publishedAt: rs.publishedAt,
          updatedAt: rs.publishedAt,
        } as any });
    }
    return;
  }
  if (stageKey === 'finalizing') {
    const ctx = publishCtxMap.get(input.taskRunId);
    const loader = ctx?.loader;
    if (loader) {
      const c = loader.counts;
      console.log(`[publish done] dryRun=${loader.dryRun} total=${c.totalRowCount} insert=${c.insertedRowCount} update=${c.updatedRowCount} delete=${c.deletedRowCount} unchanged=${c.unchangedRowCount} | entities=${c.entityRowCount} localizations=${c.localizationRowCount} relations=${c.relationRowCount} cards=${c.cardRowCount}`);
      if (!loader.dryRun && ctx.batchId) {
        const db = getLocalDb() as unknown as PublishDb;
        const builds = [...new Set(loader.builds)].sort((l, r) => l - r);
        const sourceVersionRows = await db.select({ sourceTag: SourceVersion.sourceTag, build: SourceVersion.build })
          .from(SourceVersion)
          .where(and(inArray(SourceVersion.build, builds as any), eq(SourceVersion.projectionStatus, 'completed' as any)));
        const sourceTags = [...new Set(sourceVersionRows.filter(r => r.build != null).map(r => r.sourceTag))].sort((l, r) => l - r);
        const range = {
          sourceTagMin: sourceTags[0] ?? 0,
          sourceTagMax: sourceTags[sourceTags.length - 1] ?? 0,
          buildMin: builds[0] ?? 0,
          buildMax: builds[builds.length - 1] ?? 0,
        };
        await db.insert(PublishBaseline).values({
          publishTarget: loader.stream.publishTarget,
          environment: loader.stream.environment,
          publishType: loader.stream.publishType,
          targetFingerprint: loader.stream.publishTarget,
          batchId: ctx.batchId,
          sourceTagMin: range.sourceTagMin,
          sourceTagMax: range.sourceTagMax,
          buildMin: range.buildMin,
          buildMax: range.buildMax,
          generationFingerprint: 'card-data-projector/v1',
          generationOrder: 1 as any,
          manifestHash: '',
          totalRowCount: c.totalRowCount,
          publishedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [PublishBaseline.publishTarget, PublishBaseline.environment, PublishBaseline.publishType],
          set: {
            sourceTagMin: range.sourceTagMin,
            sourceTagMax: range.sourceTagMax,
            buildMin: range.buildMin,
            buildMax: range.buildMax,
            totalRowCount: c.totalRowCount,
            publishedAt: new Date(),
            updatedAt: new Date(),
          } as any,
        });
      }
    }
    if (ctx?.batchId) {
      const db = getLocalDb();
      await db.update(PublishBatch)
        .set({ status: 'completed' as any, completedAt: new Date() as any, updatedAt: new Date() })
        .where(eq(PublishBatch.id, ctx.batchId));
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

  if (loader.isChangelog) {
    await processChangelogChunk(input, loader, plans);
  } else {
    await processFullScanChunk(input, loader, plans);
  }

  if (!loader.dryRun) {
    await flushPlans(getLocalDb() as unknown as PublishDb, loader.batchId, plans);
  }

  if (loader.processed >= loader.totalRows) {
    if (loader.dryRun) {
      const c = loader.counts;
      store.updateStage(taskRunId, 'loading_snapshots', {
        done: loader.totalRows, total: loader.totalRows,
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

      const range = await derivePublishDatasetRange(db, [loader.builds], null);

      const localDb = getLocalDb();
      await localDb.update(PublishBatch)
        .set({
          operationKind: 'publish' as any,
          sourceTagMin: range.sourceTagMin,
          sourceTagMax: range.sourceTagMax,
          buildMin: range.buildMin,
          buildMax: range.buildMax,
          generationFingerprint: 'draft',
          generationOrder: 1,
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
        done: loader.totalRows, total: loader.totalRows,
        segments: segments(loader.counts),
      }).catch(() => {});
    }
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

async function processChangelogChunk(
  input: { run: TaskRunInput; stage: TaskStageState; block: TaskBlock; store: TaskExecuteStore; taskRunId: string },
  loader: LoadingCtx,
  plans: PlanEntry[],
): Promise<void> {
  const db = getLocalDb() as unknown as PublishDb;
  const chunkIndex = (input.block.payload?.chunkIndex as number) ?? 0;
  const offset = chunkIndex * LOAD_CHUNK_SIZE;

  const rows = await db.select({ tableName: PublishRowChangeLog.tableName, rowKey: PublishRowChangeLog.rowKey })
    .from(PublishRowChangeLog)
    .where(gt(PublishRowChangeLog.changedAt, loader.publishedAt!))
    .orderBy(asc(PublishRowChangeLog.tableName), asc(PublishRowChangeLog.rowKey))
    .limit(LOAD_CHUNK_SIZE)
    .offset(offset);

  if (rows.length === 0) { loader.done = true; return; }

  for (const r of rows) loader.touchedKeys.add(`${r.tableName}:${r.rowKey}`);

  const byTable = new Map<TableName, string[]>();
  for (const r of rows) {
    const tn = r.tableName as TableName;
    if (!byTable.has(tn)) byTable.set(tn, []);
    byTable.get(tn)!.push(r.rowKey);
  }

  const buildsSet = new Set<number>(loader.builds);
  const chunkHashes = await loadChunkDataAndHash(db, byTable, buildsSet);
  loader.builds = [...buildsSet];

  for (const [tableName, curRows] of chunkHashes) {
    for (const [rowKey, curHash] of curRows) {
      const prevHash = loader.baselineRowHashes?.get(tableName)?.get(rowKey) ?? null;
      addPlan(tableName, rowKey, curHash, prevHash, plans, loader.counts);
    }
  }

  loader.processed += rows.length;
  loader.done = (offset + LOAD_CHUNK_SIZE) >= loader.totalRows;
}

const FULL_SCAN_TABLES: TableName[] = ['entities', 'entity_localizations', 'entity_relations', 'cards'];

async function processFullScanChunk(
  input: { run: TaskRunInput; stage: TaskStageState; block: TaskBlock; store: TaskExecuteStore; taskRunId: string },
  loader: LoadingCtx,
  plans: PlanEntry[],
): Promise<void> {
  const db = getLocalDb() as unknown as PublishDb;
  const cursors = loader.scanCursors!;

  // Find active table
  let tableName: string | null = null;
  for (const tn of FULL_SCAN_TABLES) { if (cursors.get(tn) !== undefined) { tableName = tn; break; } }
  if (!tableName) return;

  const cursor = cursors.get(tableName)!;
  let rawRows: any[];

  if (tableName === 'entities') {
    const tbl = LocalEntity;
    rawRows = await db.select().from(tbl)
      .where(/*and(
        sql`${TEST_BUILD} = ANY(${tbl.version})`,
        cursor == null ? undefined : or(gt(tbl.cardId, cursor.cardId), and(eq(tbl.cardId, cursor.cardId), gt(tbl.revisionHash, cursor.revisionHash))),
      )*/
        cursor == null ? undefined : or(gt(tbl.cardId, cursor.cardId), and(eq(tbl.cardId, cursor.cardId), gt(tbl.revisionHash, cursor.revisionHash)))
      )
      .orderBy(asc(tbl.cardId), asc(tbl.revisionHash)).limit(LOAD_CHUNK_SIZE) as any[];
  } else if (tableName === 'entity_localizations') {
    const tbl = LocalEntityLocalization;
    rawRows = await db.select().from(tbl)
      .where(/*and(
        sql`${TEST_BUILD} = ANY(${tbl.version})`,
        eq(tbl.lang, 'zhs'),
        cursor == null ? undefined : or(gt(tbl.cardId, cursor.cardId), and(eq(tbl.cardId, cursor.cardId), gt(tbl.lang, cursor.lang)), and(eq(tbl.cardId, cursor.cardId), eq(tbl.lang, cursor.lang), gt(tbl.revisionHash, cursor.revisionHash)), and(eq(tbl.cardId, cursor.cardId), eq(tbl.lang, cursor.lang), eq(tbl.revisionHash, cursor.revisionHash), gt(tbl.localizationHash, cursor.localizationHash))),
      )*/
        cursor == null ? undefined : or(gt(tbl.cardId, cursor.cardId), and(eq(tbl.cardId, cursor.cardId), gt(tbl.lang, cursor.lang)), and(eq(tbl.cardId, cursor.cardId), eq(tbl.lang, cursor.lang), gt(tbl.revisionHash, cursor.revisionHash)), and(eq(tbl.cardId, cursor.cardId), eq(tbl.lang, cursor.lang), eq(tbl.revisionHash, cursor.revisionHash), gt(tbl.localizationHash, cursor.localizationHash)))
      )
      .orderBy(asc(tbl.cardId), asc(tbl.lang), asc(tbl.revisionHash), asc(tbl.localizationHash)).limit(LOAD_CHUNK_SIZE) as any[];
  } else if (tableName === 'entity_relations') {
    const tbl = LocalEntityRelation;
    rawRows = await db.select().from(tbl)
      .where(cursor == null ? undefined : or(gt(tbl.sourceId, cursor.sourceId), and(eq(tbl.sourceId, cursor.sourceId), gt(tbl.relation, cursor.relation)), and(eq(tbl.sourceId, cursor.sourceId), eq(tbl.relation, cursor.relation), gt(tbl.targetId, cursor.targetId)), and(eq(tbl.sourceId, cursor.sourceId), eq(tbl.relation, cursor.relation), eq(tbl.targetId, cursor.targetId), gt(tbl.sourceRevisionHash, cursor.sourceRevisionHash))))
      .orderBy(asc(tbl.sourceId), asc(tbl.relation), asc(tbl.targetId), asc(tbl.sourceRevisionHash)).limit(LOAD_CHUNK_SIZE) as any[];
  } else {
    const tbl = LocalCard;
    rawRows = await db.select().from(tbl)
      .where(cursor == null ? undefined : gt(tbl.cardId, (cursor as Record<string, unknown>).cardId ?? cursor))
      .orderBy(asc(tbl.cardId)).limit(LOAD_CHUNK_SIZE) as any[];
  }

  if (rawRows.length === 0) { cursors.set(tableName, undefined!); return; }

  const buildsSet = new Set<number>(loader.builds);
  for (const row of rawRows) {
    const rowKey = rowKeyOf(row, tableName);
    const hash = rowHashOf(row, tableName);
    const prevHash = loader.baselineRowHashes?.get(tableName as TableName)?.get(rowKey) ?? null;
    addPlan(tableName, rowKey, hash, prevHash, plans, loader.counts);
    if (tableName === 'entities' && row.version) {
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

  const scope = (input.run.scope.snapshot as any);
  const chunkIndex = (input.block.payload?.chunkIndex as number) ?? 0;

  // Keyset pagination — load only this chunk's rows
  const cursor = ctx.applyCursor;
  const whereClauses = [eq(PublishBatchRow.batchId, ctx.batchId!), eq(PublishBatchRow.status, 'pending')];
  if (cursor) {
    whereClauses.push(or(
      gt(PublishBatchRow.tableName, cursor.tableName),
      and(eq(PublishBatchRow.tableName, cursor.tableName), gt(PublishBatchRow.rowKey, cursor.rowKey)),
    ));
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
  await remoteDb.transaction(async (tx: any) => {
    for (const row of chunk) {
      const tn = row.tableName as TableName;
      const rd = rowDataMap.get(`${tn}:${row.rowKey}`);
      if (rd == null && row.action !== 'delete') throw new Error(`Row data not found: ${tn} ${row.rowKey}`);
      if (row.action === 'insert') await insertRemoteRow(tx, tn, rd, 'insert');
      else if (row.action === 'update') {
        if (tn !== 'cards') await deleteRemoteRow(tx, tn, parseRowKey(row.rowKey));
        await insertRemoteRow(tx, tn, rd, 'update');
      } else if (row.action === 'delete') await deleteRemoteRow(tx, tn, parseRowKey(row.rowKey));
    }
  });

  for (const row of chunk) {
    await ctx.db.update(PublishBatchRow)
      .set({ status: row.action === 'unchanged' ? 'skipped' : 'applied', updatedAt: new Date(), appliedAt: new Date() })
      .where(and(eq(PublishBatchRow.batchId, ctx.batchId!), eq(PublishBatchRow.tableName, row.tableName as any), eq(PublishBatchRow.rowKey, row.rowKey)));
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
      const stream = { publishTarget: scope.publishTarget ?? 'hearthstone', environment: scope.environment ?? '', publishType: 'card_data', targetFingerprint: scope.publishTarget };
      const db = getLocalDb();
      const { baseline, baselineRowHashes } = await loadBaselineRowHashes(db, stream);
      const publishedAt = baseline?.publishedAt ?? null;
      let total = 0;
      let isChangelog = false;
      if (publishedAt) {
        const [row] = await db.select({ count: count() }).from(PublishRowChangeLog).where(gt(PublishRowChangeLog.changedAt, publishedAt));
        total = Number(row!.count);
        isChangelog = total > 0;
      }
      let tableTotals: Record<string, number> | undefined;
      if (total === 0 || !isChangelog) {
        const cnt = await Promise.all([
          db.select({ count: count() }).from(LocalEntity)/*.where(sql`${TEST_BUILD} = ANY(${LocalEntity.version})`)*/,
          db.select({ count: count() }).from(LocalEntityLocalization)/*.where(and(sql`${TEST_BUILD} = ANY(${LocalEntityLocalization.version})`, eq(LocalEntityLocalization.lang, 'zhs')))*/,
          db.select({ count: count() }).from(LocalEntityRelation),
          db.select({ count: count() }).from(LocalCard),
        ]);
        if (total === 0) total = cnt.reduce((s, r) => s + Number(r[0]!.count), 0);
        tableTotals = { entities: Number(cnt[0]![0]!.count), 'entity_localizations': Number(cnt[1]![0]!.count), 'entity_relations': Number(cnt[2]![0]!.count), cards: Number(cnt[3]![0]!.count) };
      }

      const batchId = randomUUID();
      const loader: LoadingCtx = {
        baselineRowHashes, previousManifestHash: baseline?.manifestHash ?? null, publishedAt,
        totalRows: total, isChangelog, batchId, range: null,
        counts: { totalRowCount: 0, changedRowCount: 0, insertedRowCount: 0, updatedRowCount: 0, deletedRowCount: 0, unchangedRowCount: 0, cardRowCount: 0, entityRowCount: 0, localizationRowCount: 0, relationRowCount: 0 },
        builds: [], touchedKeys: new Set(), processed: 0,
        stream,
        scanCursors: isChangelog ? undefined : new Map([['entities', null], ['entity_localizations', null], ['entity_relations', null], ['cards', null]]),
        tableTotals,
        tableProcessed: tableTotals ? { entities: 0, entity_localizations: 0, entity_relations: 0, cards: 0 } : undefined,
        dryRun: (run.params as any)?.dryRun === true,
      };
      getOrInitCtx(taskRunId).loader = loader;

      // Create a draft batch record so PublishBatchRow FK is satisfied
      if (!loader.dryRun) {
        await db.insert(PublishBatch).values({
        id: batchId,
        publishTarget: stream.publishTarget,
        environment: stream.environment,
        publishType: 'card_data',
        operationKind: 'publish' as any,
        targetFingerprint: scope.publishTarget ?? null,
        status: 'applying' as any,
        sourceTagMin: 1 as any,
        sourceTagMax: 1 as any,
        buildMin: 1 as any,
        buildMax: 1 as any,
        generationFingerprint: 'draft',
        generationOrder: 1,
        manifestHash: '',
        previousManifestHash: loader.previousManifestHash ?? null,
        totalRowCount: 0,
        changedRowCount: 0,
        insertedRowCount: 0,
        updatedRowCount: 0,
        deletedRowCount: 0,
        unchangedRowCount: 0,
        publishedAt: null as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      }

      return { ...buildPublishTaskStageEntry(stage), total };
    }
    if (stage.stageKey === 'applying_remote') {
      return { ...buildPublishTaskStageEntry(stage), total: publishCtxMap.get(taskRunId)?.pendingRowCount ?? 0 };
    }
    if (stage.stageKey === 'update_baseline') {
      const scope = (run.scope.snapshot ?? {}) as any;
      const target = { publishTarget: scope?.publishTarget ?? 'hearthstone', environment: scope?.environment ?? '' };
      const db = getLocalDb() as unknown as PublishDb;

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
