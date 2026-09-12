import { z } from 'zod';

import { and, asc, count, eq, inArray } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import {
  PublishBaseline,
  PublishBatch,
  PublishBatchRow,
  PublishRowBaseline,
} from '@tcg-cards/db/schema/local/magic';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import {
  applyPlanChunk,
  assertRemotePublishGate,
  countLocalRows,
  createPublishBatch,
  findActivePublishBatch,
  hashJson,
  insertBatchRows,
  loadBaselineHashes,
  PUBLISH_TABLE_CONFIG,
  PUBLISH_TABLES,
  releaseRemotePublishLease,
  rowHashOf,
  rowKeyOf,
  scanLocalRows,
  upsertRemotePublishLedger,
  type PublishDb,
  type PublishTableName,
} from '../../magic-publish';
import { requireMagicPublishTargetByIdentity } from '../../magic-publish-target';

/** Stable task type for publishing magic fact tables to a remote environment. */
export const magicPublishTaskType = 'magic_publish';

const input = z.object({
  publishTarget: z.string().trim().min(1),
  environment:   z.string().trim().min(1),
  dryRun:        z.boolean().optional().default(false),
  force:         z.boolean().optional().default(false),
});

const countsSchema = z.object({
  totalRowCount:     z.number(),
  changedRowCount:   z.number(),
  insertedRowCount:  z.number(),
  updatedRowCount:   z.number(),
  deletedRowCount:   z.number(),
  unchangedRowCount: z.number(),
});

const output = z.object({
  batchId:              z.string().nullable(),
  publishTarget:        z.string(),
  environment:          z.string(),
  dryRun:               z.boolean(),
  force:                z.boolean(),
  manifestHash:         z.string(),
  previousManifestHash: z.string().nullable(),
  counts:               countsSchema,
});

type Output = z.infer<typeof output>;
type Counts = z.infer<typeof countsSchema>;

const emptyCounts = (): Counts => ({
  totalRowCount:     0,
  changedRowCount:   0,
  insertedRowCount:  0,
  updatedRowCount:   0,
  deletedRowCount:   0,
  unchangedRowCount: 0,
});

/** Diff accumulator for one table, carried across its scan blocks. */
interface TableScanState {
  tableName:     PublishTableName;
  cursor:        string | null;
  done:          boolean;
  totalRows:     number;
  scannedRows:   number;
  insertedRows:  number;
  updatedRows:   number;
  deletedRows:   number;
  unchangedRows: number;
  /** Row keys seen across all scan pages of this table, for the final delete sweep. */
  sweptKeys:     Set<string>;
}

interface LoadingBlockInput {
  tableIndex: number;
  states:     TableScanState[];
}

interface PlanRow {
  tableName:       PublishTableName;
  rowKey:          string;
  rowHash:         string;
  previousRowHash: string | null;
  action:          'insert' | 'update' | 'delete';
}

interface TaskCtx {
  dryRun:               boolean;
  force:                boolean;
  publishTarget:        string;
  environment:          string;
  targetFingerprint:    string;
  connectionString:     string;
  batchId:              string | null;
  previousManifestHash: string | null;
  counts:               Counts;
  /** Baseline hashes per table, loaded once per entry. */
  baselineHashes:       Map<PublishTableName, Map<string, string>>;
  dryRunPlans:          PlanRow[];
  remoteDb:             PublishDb | null;
}

const streamOf = (c: TaskCtx) => ({ publishTarget: c.publishTarget, environment: c.environment, publishType: 'card_data' as const });

const definition = createDefinition(magicPublishTaskType, {
  version:     '2026-09-05:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_publish',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({
    init: values => ({
      dryRun:               values.dryRun ?? false,
      force:                values.force ?? false,
      publishTarget:        values.publishTarget,
      environment:          values.environment,
      targetFingerprint:    '',
      connectionString:     '',
      batchId:              null,
      previousManifestHash: null,
      counts:               emptyCounts(),
      baselineHashes:       new Map(),
      dryRunPlans:          [],
      remoteDb:             null,
    } as TaskCtx),
  })

  // ── Stage 1: loading_snapshots — scan local facts, diff against baseline ──
  // Runs bounded but NOT durable: a failed run restarts from the top and its
  // entry supersedes any half-written batch, which keeps the diff idempotent.
  .stage('loading_snapshots', { label: '扫描与差分', progressMode: 'bounded' })
  .entry(async ({ ctx }) => {
    const c = ctx as unknown as TaskCtx;
    const target = requireMagicPublishTargetByIdentity(c.publishTarget, c.environment);
    c.targetFingerprint = target.targetFingerprint;
    c.connectionString = target.connectionString;
    c.counts = emptyCounts();
    c.dryRunPlans = [];

    const db = getLocalDb();
    const stream = streamOf(c);

    // Supersede any earlier active batch on this stream (fresh run each time).
    const active = await findActivePublishBatch(db, stream);
    if (active != null) {
      await db.update(PublishBatch)
        .set({ status: 'stopped', error: 'Superseded by a newer publish batch', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(PublishBatch.id, active.id));
      await db.delete(PublishBatchRow).where(eq(PublishBatchRow.batchId, active.id));
    }

    const baseline = await db.select().from(PublishBaseline)
      .where(and(
        eq(PublishBaseline.publishTarget, stream.publishTarget),
        eq(PublishBaseline.environment, stream.environment),
        eq(PublishBaseline.publishType, stream.publishType),
      )).then(rows => rows[0] ?? null);
    c.previousManifestHash = baseline?.manifestHash ?? null;
    c.baselineHashes = await loadBaselineHashes(db, stream);

    const totals = await countLocalRows(db);
    if (!c.dryRun) {
      const batch = await createPublishBatch(db, {
        stream,
        targetFingerprint:    c.targetFingerprint,
        operationKind:        'publish',
        manifestHash:         '',
        previousManifestHash: c.previousManifestHash,
        generationOrder:      (baseline?.generationOrder ?? 0) + 1,
      });
      c.batchId = batch.id;
    }

    const states: TableScanState[] = PUBLISH_TABLES.map(name => ({
      tableName:     name,
      cursor:        null,
      done:          false,
      totalRows:     totals[name],
      scannedRows:   0,
      insertedRows:  0,
      updatedRows:   0,
      deletedRows:   0,
      unchangedRows: 0,
      sweptKeys:     new Set(),
    }));
    const total = PUBLISH_TABLES.reduce((sum, name) => sum + totals[name], 0);
    return { total, blockInput: { tableIndex: 0, states } satisfies LoadingBlockInput };
  })
  .block(async ({ ctx, blockInput, progress, done }) => {
    const c = ctx as unknown as TaskCtx;
    const db = getLocalDb();
    const baselineHashes = c.baselineHashes;

    const plans: PlanRow[] = [];
    const total = blockInput.states.reduce((s, st) => s + st.totalRows, 0);

    while (blockInput.tableIndex < PUBLISH_TABLES.length) {
      const state = blockInput.states[blockInput.tableIndex]!;
      if (state.done) {
        blockInput.tableIndex += 1;
        continue;
      }

      const config = PUBLISH_TABLE_CONFIG[state.tableName];
      const baseline = baselineHashes.get(state.tableName)!;
      const { rows, lastKey } = await scanLocalRows(db, config, state.cursor);
      state.cursor = lastKey;
      state.scannedRows += rows.length;

      const sweptKeys = state.sweptKeys;
      for (const row of rows) {
        const key = rowKeyOf(config, row);
        const hash = rowHashOf(config, row);
        sweptKeys.add(key);
        const prev = baseline.get(key);
        if (prev == null) {
          state.insertedRows += 1;
          plans.push({ tableName: state.tableName, rowKey: key, rowHash: hash, previousRowHash: null, action: 'insert' });
        } else if (prev !== hash) {
          state.updatedRows += 1;
          plans.push({ tableName: state.tableName, rowKey: key, rowHash: hash, previousRowHash: prev, action: 'update' });
        } else {
          state.unchangedRows += 1;
        }
      }

      if (rows.length === 0) {
        // Table fully scanned — sweep its baseline: rows no longer present
        // locally are scheduled for remote delete.
        for (const key of [...baseline.keys()].sort()) {
          if (sweptKeys.has(key)) continue;
          state.deletedRows += 1;
          plans.push({ tableName: state.tableName, rowKey: key, rowHash: '', previousRowHash: baseline.get(key) ?? null, action: 'delete' });
        }
        state.done = true;
        blockInput.tableIndex += 1;
      }

      if (plans.length >= 4000) break;
    }

    if (plans.length > 0) {
      if (!c.dryRun && c.batchId != null) {
        await insertBatchRows(db, c.batchId, plans);
      } else if (c.dryRun) {
        c.dryRunPlans.push(...plans);
      }
    }

    const next = blockInput;
    const doneRows = blockInput.states.slice(0, blockInput.tableIndex).reduce((s, st) => s + st.totalRows, 0)
      + (blockInput.states[blockInput.tableIndex]?.scannedRows ?? 0);
    progress({ done: Math.min(doneRows, total), total });
    return blockInput.tableIndex >= PUBLISH_TABLES.length ? done(next) : next;
  })
  .exit(async ({ ctx, blockInput }) => {
    const c = ctx as unknown as TaskCtx;
    const db = getLocalDb();
    const states = (blockInput as LoadingBlockInput).states;

    const toCounts = (): Counts => {
      const byAction = { insert: 0, update: 0, delete: 0, unchanged: 0 };
      for (const st of states) {
        byAction.insert += st.insertedRows;
        byAction.update += st.updatedRows;
        byAction.delete += st.deletedRows;
        byAction.unchanged += st.unchangedRows;
      }
      const changed = byAction.insert + byAction.update + byAction.delete;
      return {
        totalRowCount:     changed + byAction.unchanged,
        changedRowCount:   changed,
        insertedRowCount:  byAction.insert,
        updatedRowCount:   byAction.update,
        deletedRowCount:   byAction.delete,
        unchangedRowCount: byAction.unchanged,
      };
    };

    const counts = toCounts();
    c.counts = counts;
    let manifestHash: string;

    if (c.dryRun) {
      // Dry-run plans only carry changed rows (unchanged ones are counted but
      // never stored), so every plan row contributes to the manifest.
      const changed = c.dryRunPlans
        .map(p => ({ tableName: p.tableName, rowKey: p.rowKey, rowHash: p.rowHash }))
        .sort((a, b) => a.tableName.localeCompare(b.tableName) || a.rowKey.localeCompare(b.rowKey));
      manifestHash = hashJson(changed);
    } else {
      const changedRows = await db.select({ tableName: PublishBatchRow.tableName, rowKey: PublishBatchRow.rowKey, rowHash: PublishBatchRow.rowHash })
        .from(PublishBatchRow)
        .where(and(
          eq(PublishBatchRow.batchId, c.batchId!),
          inArray(PublishBatchRow.action, ['insert', 'update', 'delete']),
        ))
        .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowKey));
      manifestHash = hashJson(changedRows.map(r => ({ tableName: r.tableName, rowKey: r.rowKey, rowHash: r.rowHash })));
      await db.update(PublishBatch)
        .set({
          totalRowCount:     counts.totalRowCount,
          changedRowCount:   counts.changedRowCount,
          insertedRowCount:  counts.insertedRowCount,
          updatedRowCount:   counts.updatedRowCount,
          deletedRowCount:   counts.deletedRowCount,
          unchangedRowCount: counts.unchangedRowCount,
          manifestHash,
          updatedAt:         new Date(),
        }).where(eq(PublishBatch.id, c.batchId!));
    }

    return { batchId: c.batchId, counts, manifestHash, previousManifestHash: c.previousManifestHash, pendingRowCount: counts.changedRowCount };
  })

  // ── Stage 2: applying_remote — apply the plan to the remote database ──
  .stage('applying_remote', { label: '应用远端', progressMode: 'bounded' })
  .enable({
    when:      input => !input.dryRun,
    otherwise: () => ({ batchId: null, counts: emptyCounts(), manifestHash: '', previousManifestHash: null, pendingRowCount: 0 }) as unknown as never,
  })
  .entry(async ({ ctx }) => {
    const c = ctx as unknown as TaskCtx;
    const db = getLocalDb();
    const stream = streamOf(c);

    const batch = await db.select().from(PublishBatch).where(eq(PublishBatch.id, c.batchId!)).then(rows => rows[0] ?? null);
    if (batch == null) throw new Error(`publish batch ${c.batchId} not found`);

    const remoteDb = createDb(c.connectionString);
    c.remoteDb = remoteDb;
    await assertRemotePublishGate(remoteDb, {
      publishTarget:        stream.publishTarget,
      environment:          stream.environment,
      publishType:          stream.publishType,
      targetFingerprint:    batch.targetFingerprint,
      manifestHash:         batch.manifestHash,
      previousManifestHash: batch.previousManifestHash ?? null,
      generationOrder:      batch.generationOrder,
      leaseHolderId:        batch.id,
      force:                c.force,
    });

    const [pending] = await db.select({ n: count() }).from(PublishBatchRow)
      .where(and(eq(PublishBatchRow.batchId, c.batchId!), eq(PublishBatchRow.status, 'pending')));
    const pendingCount = Number(pending?.n ?? 0);
    return { total: pendingCount, blockInput: { processed: 0, total: pendingCount } as { processed: number, total: number } };
  })
  .block(async ({ ctx, blockInput, progress, done }) => {
    const c = ctx as unknown as TaskCtx;
    const db = getLocalDb();
    const stream = streamOf(c);
    const bi = blockInput as { processed: number, total: number };
    const n = await applyPlanChunk(db, c.remoteDb!, stream, c.batchId!, c.batchId!);
    const next = { ...bi, processed: bi.processed + n };
    progress({ done: Math.min(next.processed, next.total), total: next.total });
    return next.processed >= next.total || n === 0 ? done(next) : next;
  })
  .exit(async ({ ctx }) => {
    const c = ctx as unknown as TaskCtx;
    await c.remoteDb?.$client.end({ timeout: 1 });
    c.remoteDb = null;
    return c.batchId;
  })

  // ── Stage 3: update_baseline — roll applied rows into the row baseline ──
  .stage('update_baseline', { label: '更新基线', progressMode: 'bounded' })
  .enable({
    when:      input => !input.dryRun,
    otherwise: input => input as unknown as never,
  })
  .entry(async ({ ctx }) => {
    const c = ctx as unknown as TaskCtx;
    const db = getLocalDb();
    const [applied] = await db.select({ n: count() }).from(PublishBatchRow)
      .where(and(eq(PublishBatchRow.batchId, c.batchId!), eq(PublishBatchRow.status, 'applied')));
    const appliedCount = Number(applied?.n ?? 0);
    return { total: appliedCount, blockInput: { processed: 0, total: appliedCount } as { processed: number, total: number } };
  })
  .block(async ({ ctx, blockInput, progress, done }) => {
    const c = ctx as unknown as TaskCtx;
    const db = getLocalDb();
    const stream = streamOf(c);
    const bi = blockInput as { processed: number, total: number };

    const batch = await db.select().from(PublishBatchRow)
      .where(and(
        eq(PublishBatchRow.batchId, c.batchId!),
        eq(PublishBatchRow.status, 'applied'),
      ))
      .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowKey))
      .limit(1000)
      .offset(bi.processed);

    if (batch.length > 0) {
      for (const row of batch) {
        if (row.action === 'delete') {
          await db.delete(PublishRowBaseline).where(and(
            eq(PublishRowBaseline.publishTarget, stream.publishTarget),
            eq(PublishRowBaseline.environment, stream.environment),
            eq(PublishRowBaseline.publishType, stream.publishType),
            eq(PublishRowBaseline.tableName, row.tableName),
            eq(PublishRowBaseline.rowKey, row.rowKey),
          ));
        } else {
          await db.insert(PublishRowBaseline).values({
            publishTarget: stream.publishTarget,
            environment:   stream.environment,
            publishType:   stream.publishType,
            tableName:     row.tableName,
            rowKey:        row.rowKey,
            rowHash:       row.rowHash,
            sourceBatchId: c.batchId!,
            publishedAt:   new Date(),
          }).onConflictDoUpdate({
            target: [
              PublishRowBaseline.publishTarget,
              PublishRowBaseline.environment,
              PublishRowBaseline.publishType,
              PublishRowBaseline.tableName,
              PublishRowBaseline.rowKey,
            ],
            set: {
              rowHash:       row.rowHash,
              sourceBatchId: c.batchId!,
              publishedAt:   new Date(),
              updatedAt:     new Date(),
            },
          });
        }
      }
    }

    const next = { ...bi, processed: bi.processed + batch.length };
    progress({ done: Math.min(next.processed, next.total), total: next.total });
    return next.processed >= next.total || batch.length === 0 ? done(next) : next;
  })
  .exit(async ({ ctx }) => ctx)

  // ── Stage 4: finalize — stream baseline, remote ledger, batch completion ──
  .stage('finalize', { label: '收尾', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    const c = ctx as unknown as TaskCtx;
    const db = getLocalDb();
    const stream = streamOf(c);

    const batch = c.batchId != null
      ? await db.select().from(PublishBatch).where(eq(PublishBatch.id, c.batchId)).then(rows => rows[0] ?? null)
      : null;

    if (batch != null && !c.dryRun) {
      const remoteDb = createDb(c.connectionString);
      try {
        await db.insert(PublishBaseline).values({
          publishTarget:         stream.publishTarget,
          environment:           stream.environment,
          publishType:           stream.publishType,
          targetFingerprint:     batch.targetFingerprint,
          batchId:               batch.id,
          generationFingerprint: batch.generationFingerprint,
          generationOrder:       batch.generationOrder,
          manifestHash:          batch.manifestHash,
          totalRowCount:         batch.totalRowCount,
          publishedAt:           new Date(),
        }).onConflictDoUpdate({
          target: [
            PublishBaseline.publishTarget,
            PublishBaseline.environment,
            PublishBaseline.publishType,
          ],
          set: {
            targetFingerprint:     batch.targetFingerprint,
            batchId:               batch.id,
            generationFingerprint: batch.generationFingerprint,
            generationOrder:       batch.generationOrder,
            manifestHash:          batch.manifestHash,
            totalRowCount:         batch.totalRowCount,
            publishedAt:           new Date(),
            updatedAt:             new Date(),
          },
        });
        await upsertRemotePublishLedger(remoteDb, batch);
        await releaseRemotePublishLease(remoteDb, { ...stream, leaseHolderId: batch.id });
        await db.update(PublishBatch)
          .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(PublishBatch.id, batch.id));
      } finally {
        await remoteDb.$client.end({ timeout: 1 });
      }
    }

    return {
      batchId:              batch?.id ?? null,
      publishTarget:        c.publishTarget,
      environment:          c.environment,
      dryRun:               c.dryRun,
      force:                c.force,
      manifestHash:         batch?.manifestHash ?? '',
      previousManifestHash: batch?.previousManifestHash ?? null,
      counts:               batch != null
        ? {
          totalRowCount:     batch.totalRowCount,
          changedRowCount:   batch.changedRowCount,
          insertedRowCount:  batch.insertedRowCount,
          updatedRowCount:   batch.updatedRowCount,
          deletedRowCount:   batch.deletedRowCount,
          unchangedRowCount: batch.unchangedRowCount,
        }
        : c.counts,
    } as Output;
  })
  .build();

export const magicPublishTaskDefinition = definition;
