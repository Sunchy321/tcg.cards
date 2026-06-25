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
import { and, eq, asc } from 'drizzle-orm';
import { createDb } from '@tcg-cards/db';
import { PublishBatchRow, PublishBatch } from '@tcg-cards/db/schema/local/hearthstone';
import { createPublishPlan, loadRowDataChunk, insertRemoteRow, deleteRemoteRow, parseRowKey } from '../../hsdata-publish';
import type { TableName } from '../../hsdata-publish';
import { requireHearthstonePublishTargetByIdentity } from '../../hsdata-publish-target';
import { PublishJobInterruptedError } from '../../hsdata-publish-progress';
import { getLocalDb } from '../../hsdata-local-db';

export const publishTaskType = 'hsdata_publish';
export const publishTaskScopeType = 'publish_stream';
export const publishTaskDefinitionVersion = '2026-06-22:v1';

export const publishTaskStagePlans: TaskStagePlan[] = [
  { stageKey: 'loading_baseline', stageIndex: 0, label: 'Load baseline', progressMode: 'simple', resumeMode: 'none' },
  { stageKey: 'loading_snapshots', stageIndex: 1, label: 'Load snapshots', progressMode: 'bounded', resumeMode: 'none' },
  { stageKey: 'deriving_range', stageIndex: 2, label: 'Derive range', progressMode: 'simple', resumeMode: 'none' },
  { stageKey: 'building_diff', stageIndex: 3, label: 'Build diff', progressMode: 'bounded', resumeMode: 'none' },
  { stageKey: 'writing_batch', stageIndex: 4, label: 'Write batch', progressMode: 'simple', resumeMode: 'none' },
  { stageKey: 'writing_batch_rows', stageIndex: 5, label: 'Write batch rows', progressMode: 'bounded', resumeMode: 'none' },
  { stageKey: 'checking_remote_gate', stageIndex: 6, label: 'Check remote gate', progressMode: 'simple', resumeMode: 'none' },
  { stageKey: 'applying_remote', stageIndex: 7, label: 'Apply remote', progressMode: 'bounded', resumeMode: 'none' },
  { stageKey: 'finalizing', stageIndex: 8, label: 'Finalize', progressMode: 'simple', resumeMode: 'none' },
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
  return { stageKey: stage.stageKey, stageIndex: stage.stageIndex, progressMode: stage.progressMode, resumeMode: stage.resumeMode, total: stage.total, selectionAnchor: stage.selectionAnchor };
}

/*
 * ── Executor block generation ───────────────────────
 */

const REMOTE_CHUNK_SIZE = 500;

/** Cross-block execution context for one publish run. */
interface PublishCtx {
  batchId: string;
  db: ReturnType<typeof getLocalDb>;
  /** Loaded once, then each block processes one slice. */
  pendingRows?: any[];
  remoteDb?: any;
}

const publishCtxMap = new Map<string, PublishCtx>();

/** Returns chunk blocks for applying_remote, or a single block for other stages. */
export function buildPublishTaskBlocks(stage: TaskStageState, taskRunId: string): TaskBlock[] {
  if (stage.stageKey === 'applying_remote') {
    const ctx = publishCtxMap.get(taskRunId);
    const rows = ctx?.pendingRows ?? [];
    const n = Math.ceil(rows.length / REMOTE_CHUNK_SIZE);
    if (n <= 1) {
      return [{ blockKey: 'apply:run', effectModel: 'reconcilable', payload: { stageKey: 'applying_remote' } }];
    }
    return Array.from({ length: n }, (_, i) => ({
      blockKey: `apply:chunk_${i + 1}`,
      effectModel: 'reconcilable' as const,
      payload: { stageKey: 'applying_remote', chunkIndex: i },
    }));
  }
  return [{ blockKey: `${stage.stageKey}:run`, effectModel: 'reconcilable', payload: { stageKey: stage.stageKey } }];
}

/** Executes one publish stage block. Called by the bridge's executor loop. */
export async function executePublishStageBlock(input: {
  run: TaskRunInput;
  stage: TaskStageState;
  block: TaskBlock;
  store: TaskExecuteStore;
  taskRunId: string;
}): Promise<void> {
  const { store, taskRunId } = input;
  const params = readPublishTaskParams(input.run);
  const scope = {
    publishTarget: (input.run.scope.snapshot as any)?.publishTarget ?? 'hearthstone',
    environment: (input.run.scope.snapshot as any)?.environment ?? '',
  };
  const stageKey = input.block.payload?.stageKey as string;

  if (stageKey === 'building_diff') {
    const result = await createPublishPlan({
      ...scope, publishType: 'card_data', dryRun: params.dryRun ?? false,
      onProgress: (e) => { store.updateStage(taskRunId, 'building_diff', { total: e.total ?? null, done: e.completed ?? null }).catch(() => {}); },
    });
    publishCtxMap.set(taskRunId, { batchId: result.batchId, db: getLocalDb() });
    return;
  }

  if (stageKey === 'applying_remote') {
    const ctx = publishCtxMap.get(taskRunId);
    if (!ctx) throw new Error('Publish context not found for task ' + taskRunId);

    // Load pending rows + create remote DB on first applying_remote block
    if (!ctx.pendingRows) {
      ctx.pendingRows = await ctx.db.select()
        .from(PublishBatchRow)
        .where(and(eq(PublishBatchRow.batchId, ctx.batchId), eq(PublishBatchRow.status, 'pending')))
        .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowKey));

      if (ctx.pendingRows.length > 0) {
        const target = requireHearthstonePublishTargetByIdentity(scope.publishTarget, scope.environment);
        ctx.remoteDb = createDb(target.connectionString);
      }
    }

    const chunkIndex = (input.block.payload?.chunkIndex as number) ?? 0;
    const start = chunkIndex * REMOTE_CHUNK_SIZE;
    const chunk = ctx.pendingRows!.slice(start, start + REMOTE_CHUNK_SIZE);
    if (chunk.length === 0) return;

    // Group chunk rows by table
    const byTable = new Map<string, typeof chunk>();
    for (const row of chunk) {
      const tn = row.tableName;
      if (!byTable.has(tn)) byTable.set(tn, []);
      byTable.get(tn)!.push(row);
    }

    // Load row data
    const rowDataMap = new Map<string, unknown>();
    for (const [tableName, rows] of byTable) {
      const keySet = [...new Set(rows.map(r => r.rowKey))];
      const data = await loadRowDataChunk(ctx.db, tableName as TableName, keySet);
      for (const [pk, d] of data) rowDataMap.set(`${tableName}:${pk}`, d);
    }

    // Apply chunk to remote
    const remoteDb = ctx.remoteDb!;

    await (remoteDb as any).transaction(async (tx: any) => {
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

    // Mark chunk rows as applied locally
    for (const row of chunk) {
      await ctx.db.update(PublishBatchRow)
        .set({ status: row.action === 'unchanged' ? 'skipped' : 'applied', updatedAt: new Date(), appliedAt: new Date() })
        .where(and(eq(PublishBatchRow.batchId, ctx.batchId), eq(PublishBatchRow.tableName, row.tableName as any), eq(PublishBatchRow.rowKey, row.rowKey)));
    }
    return;
  }

  if (stageKey === 'finalizing') {
    publishCtxMap.delete(taskRunId);
    return;
  }
}

export const publishTaskDefinition: TaskDefinition = {
  taskType: publishTaskType,
  definitionVersion: publishTaskDefinitionVersion,
  supportsResume: false,
  effectModel: 'reconcilable',
  buildStagePlan(input) { assertPublishTaskRunInput(input); return buildPublishTaskStagePlan(); },
  prepareStageEntry({ stage }) { return buildPublishTaskStageEntry(stage); },
  buildBlocks({ stage, taskRunId }) { return buildPublishTaskBlocks(stage, taskRunId); },
  async executeBlock(input) {
    await executePublishStageBlock(input);
  },
};
