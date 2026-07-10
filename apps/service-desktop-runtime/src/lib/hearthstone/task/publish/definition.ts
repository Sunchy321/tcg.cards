import { z } from 'zod';

import { and, eq, ne, or, asc, desc, count, gt, inArray, isNull, sql } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import {
  PublishBaseline, PublishRowBaseline, PublishBatchRow, PublishBatch,
} from '@tcg-cards/db/schema/local/hearthstone';
import {
  BaseEntity as LocalBaseEntity, BaseEntityLocalization as LocalBaseEntityLocalization,
  BaseEntityRelation as LocalBaseEntityRelation, BaseCard as LocalBaseCard,
  Entity as LocalEntity, EntityLocalization as LocalEntityLocalization,
  EntityRelation as LocalEntityRelation, Card as LocalCard,
} from '@tcg-cards/db/schema/local/hearthstone';
import { Entity as RemoteEntity, EntityLocalization as RemoteEntityLocalization,
  EntityRelation as RemoteEntityRelation, Card as RemoteCard } from '@tcg-cards/db/schema/remote/hearthstone';
import { PublishStreamRegistration } from '@tcg-cards/db/schema/remote/publish';
import {
  loadRowDataChunk, insertRemoteRow, deleteRemoteRow, parseRowKey,
  loadReanchorRowCounts, reanchorReadBatchSize, buildManifestLine,
  upsertRemotePublishLedger, assertRemotePublishGate, renewRemotePublishLease,
  findActiveStreamBatch, hashJson, derivePublishDatasetRange, rowKeyOf, rowHashOf,
  loadBaselineRowHashes, chunkValues,
} from '../../hsdata-publish';
import type { TableName, PublishDb } from '../../hsdata-publish';
import { requireHearthstonePublishTargetByIdentity } from '../../hsdata-publish-target';
import { publishCardDataGeneration } from '../../publish-generation';
import { getLocalDb } from '../../hsdata-local-db';
import { createDefinition } from '#task/definition';
import type { ProgressFn, BlockDone } from '#task/definition';

// ── Constants ──

const LOAD_CHUNK_SIZE = 1000;
const REMOTE_CHUNK_SIZE = 500;
const FULL_SCAN_TABLES: TableName[] = ['entities', 'entity_localizations', 'entity_relations', 'cards'];

// ── Types ──

type PlanAction = typeof PublishBatchRow.$inferSelect['action'];
type PlanEntry = { tableName: string; rowKey: string; action: PlanAction; rowHash: string | null; previousRowHash: string | null };

interface LoadingCounts {
  totalRowCount: number; changedRowCount: number; insertedRowCount: number;
  updatedRowCount: number; deletedRowCount: number; unchangedRowCount: number;
  cardRowCount: number; entityRowCount: number; localizationRowCount: number; relationRowCount: number;
}

interface PreviousRange { buildMin: number; buildMax: number }

/** Stage I/O: loading_snapshots exit → applying_remote entry. */
interface LoadingOutput {
  batchId: string;
  pendingRowCount: number;
  counts: LoadingCounts;
  builds: number[];
  previousRange: PreviousRange | null;
  totalRows: number;
}

/** Stage I/O: applying_remote exit → update_baseline entry. Same as LoadingOutput — applying adds no new business data. */
type ApplyingOutput = LoadingOutput;

/** Stage I/O: update_baseline exit → finalizing input. */
interface BaselineOutput extends LoadingOutput {
  manifestHash: string;
}

/** Block input for loading_snapshots chunk loop. */
interface LoadingBlockInput {
  cursor: any;
  processed: number;
}

/** Block input for applying_remote chunk loop. */
interface ApplyBlockInput {
  cursor: { tableName: string; rowKey: string } | null;
  processed: number;
}

/** Block input for update_baseline chunk loop. */
interface BaselineBlockInput {
  tableName: string | null;
  cursor: any;
  processed: number;
}

/** Ctx: resources + immutable config + cross-stage shared data. */
interface PublishCtx {
  db: PublishDb;
  dryRun: boolean;
  operationKind: string;
  stream: { publishTarget: string; environment: string; publishType: string; targetFingerprint: string };
  batchId?: string;
  pendingRowCount: number;
  appliedCount?: number;
  remoteDb?: any;
  leaseHolderId?: string;
  leaseStream?: { publishTarget: string; environment: string; publishType: string };
  /** Mutable state for loading_snapshots block loop. */
  loader?: LoaderState;
  /** Mutable state for update_baseline block loop. */
  reanchor?: ReanchorState;
}

interface LoaderState {
  baselineRowHashes: Map<TableName, Map<string, string>> | undefined;
  previousManifestHash: string | null;
  previousRange: PreviousRange | null;
  publishedAt: Date | null;
  batchId: string;
  counts: LoadingCounts;
  builds: number[];
  processed: number;
  totalRows: number;
  scanCursors: Map<TableName, any>;
  tableTotals: Record<TableName, number>;
  tableProcessed: Record<TableName, number>;
}

// ── Utility ──

function emptyCounts(): LoadingCounts {
  return { totalRowCount: 0, changedRowCount: 0, insertedRowCount: 0, updatedRowCount: 0, deletedRowCount: 0, unchangedRowCount: 0, cardRowCount: 0, entityRowCount: 0, localizationRowCount: 0, relationRowCount: 0 };
}

function addPlan(
  tableName: string, rowKey: string, curHash: string | null, prevHash: string | null,
  plans: PlanEntry[], counts: LoadingCounts,
): void {
  counts.totalRowCount += 1;
  if (tableName === 'cards') counts.cardRowCount += 1;
  else if (tableName === 'entities') counts.entityRowCount += 1;
  else if (tableName === 'entity_localizations') counts.localizationRowCount += 1;
  else if (tableName === 'entity_relations') counts.relationRowCount += 1;

  if (curHash != null && prevHash == null) {
    plans.push({ tableName, rowKey, action: 'insert', rowHash: curHash, previousRowHash: null });
    counts.insertedRowCount += 1; counts.changedRowCount += 1;
  } else if (curHash != null && prevHash != null && curHash !== prevHash) {
    plans.push({ tableName, rowKey, action: 'update', rowHash: curHash, previousRowHash: prevHash });
    counts.updatedRowCount += 1; counts.changedRowCount += 1;
  } else if (curHash != null && prevHash != null) {
    plans.push({ tableName, rowKey, action: 'unchanged', rowHash: curHash, previousRowHash: prevHash });
    counts.unchangedRowCount += 1;
  } else if (curHash == null) {
    plans.push({ tableName, rowKey, action: 'delete', rowHash: null, previousRowHash: prevHash });
    counts.deletedRowCount += 1; counts.changedRowCount += 1;
  }
}

async function flushPlans(db: PublishDb, batchId: string, plans: PlanEntry[]): Promise<void> {
  if (plans.length === 0) return;
  const now = new Date();
  for (const chunk of chunkValues(plans, 100)) {
    await db.insert(PublishBatchRow).values(chunk.map(p => ({
      batchId, tableName: p.tableName, rowKey: p.rowKey,
      rowHash: p.rowHash ?? '', previousRowHash: p.previousRowHash ?? null,
      action: p.action, status: p.action === 'unchanged' ? 'skipped' as const : 'pending' as const,
      error: null, createdAt: now, updatedAt: now, appliedAt: null,
    })));
  }
  plans.length = 0;
}

function loadingSegments(counts: LoadingCounts) {
  return [
    { name: 'cards', done: counts.cardRowCount, total: Math.max(counts.cardRowCount, 1) },
    { name: 'entities', done: counts.entityRowCount, total: Math.max(counts.entityRowCount, 1) },
    { name: 'localizations', done: counts.localizationRowCount, total: Math.max(counts.localizationRowCount, 1) },
    { name: 'relations', done: counts.relationRowCount, total: Math.max(counts.relationRowCount, 1) },
  ];
}

function isLoadingScanComplete(loader: LoaderState): boolean {
  return FULL_SCAN_TABLES.every(tn => loader.scanCursors.get(tn) === undefined);
}

// ── loading_snapshots: full-scan chunk ──

async function processFullScanChunk(loader: LoaderState, plans: PlanEntry[]): Promise<void> {
  const db = getLocalDb() as unknown as PublishDb;
  const cursors = loader.scanCursors;

  let tableName: TableName | null = null;
  for (const tn of FULL_SCAN_TABLES) { if (cursors.get(tn) !== undefined) { tableName = tn; break; } }
  if (!tableName) return;

  const cursor = cursors.get(tableName)!;
  let rawRows: any[];
  const since = loader.publishedAt;

  if (tableName === 'entities') {
    const tbl = LocalBaseEntity;
    rawRows = await db.select().from(tbl).where(and(
      since ? or(and(isNull(tbl.deletedAt), or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))), gt(tbl.deletedAt, since)) : isNull(tbl.deletedAt),
      cursor == null ? undefined : sql`(${tbl.cardId}, ${tbl.revisionHash}) > (${cursor.cardId}, ${cursor.revisionHash})`,
    )).orderBy(asc(tbl.cardId), asc(tbl.revisionHash)).limit(LOAD_CHUNK_SIZE) as any[];
  } else if (tableName === 'entity_localizations') {
    const tbl = LocalBaseEntityLocalization;
    rawRows = await db.select().from(tbl).where(and(
      since ? or(and(isNull(tbl.deletedAt), or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))), gt(tbl.deletedAt, since)) : isNull(tbl.deletedAt),
      cursor == null ? undefined : sql`(${tbl.cardId}, ${tbl.lang}, ${tbl.revisionHash}, ${tbl.localizationHash}) > (${cursor.cardId}, ${cursor.lang}, ${cursor.revisionHash}, ${cursor.localizationHash})`,
    )).orderBy(asc(tbl.cardId), asc(tbl.lang), asc(tbl.revisionHash), asc(tbl.localizationHash)).limit(LOAD_CHUNK_SIZE) as any[];
  } else if (tableName === 'entity_relations') {
    const tbl = LocalBaseEntityRelation;
    rawRows = await db.select().from(tbl).where(and(
      since ? or(and(isNull(tbl.deletedAt), or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))), gt(tbl.deletedAt, since)) : isNull(tbl.deletedAt),
      cursor == null ? undefined : sql`(${tbl.sourceId}, ${tbl.relation}, ${tbl.targetId}, ${tbl.sourceRevisionHash}) > (${cursor.sourceId}, ${cursor.relation}, ${cursor.targetId}, ${cursor.sourceRevisionHash})`,
    )).orderBy(asc(tbl.sourceId), asc(tbl.relation), asc(tbl.targetId), asc(tbl.sourceRevisionHash)).limit(LOAD_CHUNK_SIZE) as any[];
  } else {
    const tbl = LocalBaseCard;
    rawRows = await db.select().from(tbl).where(and(
      since ? or(and(isNull(tbl.deletedAt), or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))), gt(tbl.deletedAt, since)) : isNull(tbl.deletedAt),
      cursor == null ? undefined : sql`(${tbl.cardId}) > (${cursor.cardId ?? cursor})`,
    )).orderBy(asc(tbl.cardId)).limit(LOAD_CHUNK_SIZE) as any[];
  }

  if (rawRows.length === 0) { cursors.set(tableName, undefined!); return; }

  const buildsSet = new Set<number>(loader.builds);
  for (const row of rawRows) {
    const rk = rowKeyOf(row, tableName);
    const isDeleted = row.deletedAt != null;
    const hash = isDeleted ? null : rowHashOf(row, tableName);
    const prevHash = loader.baselineRowHashes?.get(tableName as TableName)?.get(rk) ?? null;
    addPlan(tableName, rk, hash, prevHash, plans, loader.counts);
    if (!isDeleted && tableName !== 'cards' && row.version) (row.version as number[]).forEach(v => buildsSet.add(v));
  }

  cursors.set(tableName, rawRows[rawRows.length - 1]);
  loader.builds = [...buildsSet];
  loader.processed += rawRows.length;
  if (loader.tableProcessed) loader.tableProcessed[tableName]! += rawRows.length;
}

// ── loading_snapshots block ──

async function loadingBlock(
  ctx: PublishCtx, loader: LoaderState, blockInput: LoadingBlockInput, progress: ProgressFn<'bounded'>,
  done: (finalBlockInput: any) => BlockDone,
): Promise<LoadingBlockInput | BlockDone> {
  const plans: PlanEntry[] = [];
  await processFullScanChunk(loader, plans);

  if (!ctx.dryRun) await flushPlans(getLocalDb() as unknown as PublishDb, loader.batchId, plans);

  if (isLoadingScanComplete(loader)) {
    if (ctx.dryRun) {
      progress({ done: loader.processed, total: loader.totalRows, segments: dryRunSegments(loader.counts) });
    } else {
      const db = getLocalDb() as unknown as PublishDb;
      const manifestRows = await db.select({
        tableName: PublishBatchRow.tableName, rowKey: PublishBatchRow.rowKey, rowHash: PublishBatchRow.rowHash,
      }).from(PublishBatchRow).where(and(eq(PublishBatchRow.batchId, loader.batchId), ne(PublishBatchRow.action, 'delete')))
        .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowKey));

      const manifestHash = hashJson(manifestRows.map(r => ({ tableName: r.tableName, rowKey: r.rowKey, rowHash: r.rowHash }))
        .sort((a, b) => a.tableName.localeCompare(b.tableName) || a.rowKey.localeCompare(b.rowKey)));

      const range = await derivePublishDatasetRange(db, [loader.builds], loader.previousRange);
      await getLocalDb().update(PublishBatch).set({
        operationKind: 'publish' as any, buildMin: range.buildMin, buildMax: range.buildMax,
        generationFingerprint: publishCardDataGeneration.fingerprint, generationOrder: publishCardDataGeneration.order,
        manifestHash, previousManifestHash: loader.previousManifestHash,
        totalRowCount: loader.counts.totalRowCount, changedRowCount: loader.counts.changedRowCount,
        insertedRowCount: loader.counts.insertedRowCount, updatedRowCount: loader.counts.updatedRowCount,
        deletedRowCount: loader.counts.deletedRowCount, unchangedRowCount: loader.counts.unchangedRowCount,
        updatedAt: new Date(),
      }).where(eq(PublishBatch.id, loader.batchId));

      const [pendingRow] = await db.select({ count: count() }).from(PublishBatchRow)
        .where(and(eq(PublishBatchRow.batchId, loader.batchId), eq(PublishBatchRow.status, 'pending')));
      ctx.pendingRowCount = Number(pendingRow!.count);

      progress({ done: loader.processed, total: loader.totalRows, segments: loadingSegments(loader.counts) });
    }
    return done(blockInput);
  }

  progress({
    done: loader.processed, total: loader.totalRows,
    segments: loader.tableTotals && loader.tableProcessed
      ? Object.entries(loader.tableTotals).map(([name, total]) => ({
          name, done: loader.tableProcessed![name as TableName]! ?? 0, total,
        }))
      : loadingSegments(loader.counts),
  });

  return { cursor: null, processed: loader.processed };
}

function dryRunSegments(counts: LoadingCounts) {
  return [
    { name: 'insert', done: counts.insertedRowCount, total: Math.max(counts.insertedRowCount, 1) },
    { name: 'update', done: counts.updatedRowCount, total: Math.max(counts.updatedRowCount, 1) },
    { name: 'delete', done: counts.deletedRowCount, total: Math.max(counts.deletedRowCount, 1) },
    { name: 'unchanged', done: counts.unchangedRowCount, total: Math.max(counts.unchangedRowCount, 1) },
    { name: 'entities', done: counts.entityRowCount, total: Math.max(counts.entityRowCount, 1) },
    { name: 'localizations', done: counts.localizationRowCount, total: Math.max(counts.localizationRowCount, 1) },
    { name: 'cards', done: counts.cardRowCount, total: Math.max(counts.cardRowCount, 1) },
  ];
}

// ── applying_remote block ──

async function applyingBlock(
  ctx: PublishCtx, batchId: string, blockInput: ApplyBlockInput, progress: ProgressFn<'bounded'>,
  done: (finalBlockInput: any) => BlockDone,
): Promise<ApplyBlockInput | BlockDone> {
  const cursor = blockInput.cursor;
  const whereClauses = [eq(PublishBatchRow.batchId, batchId), eq(PublishBatchRow.status, 'pending')];
  if (cursor) {
    whereClauses.push(or(
      gt(PublishBatchRow.tableName, cursor.tableName),
      and(eq(PublishBatchRow.tableName, cursor.tableName), gt(PublishBatchRow.rowKey, cursor.rowKey)),
    )!);
  }
  const chunk = await ctx.db.select().from(PublishBatchRow)
    .where(and(...whereClauses))
    .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowKey))
    .limit(REMOTE_CHUNK_SIZE);
  if (chunk.length === 0) return done(blockInput);

  const lastRow = chunk[chunk.length - 1]!;
  const nextCursor = { tableName: lastRow.tableName, rowKey: lastRow.rowKey };

  // Lazy init remote
  if (!ctx.remoteDb) {
    ctx.remoteDb = createDb(requireHearthstonePublishTargetByIdentity(ctx.stream.publishTarget, ctx.stream.environment).connectionString);
    progress({ done: 0, total: ctx.pendingRowCount });

    const batch = await ctx.db.select().from(PublishBatch).where(eq(PublishBatch.id, batchId)).then(r => r[0] ?? null);
    if (!batch) throw new Error(`Publish batch ${batchId} not found`);
    await assertRemotePublishGate(ctx.remoteDb as any, {
      publishTarget: batch.publishTarget, environment: batch.environment, publishType: batch.publishType,
      targetFingerprint: batch.targetFingerprint, manifestHash: batch.manifestHash,
      previousManifestHash: batch.previousManifestHash ?? null, buildMax: batch.buildMax,
      generationFingerprint: batch.generationFingerprint, generationOrder: batch.generationOrder,
      leaseHolderId: batchId,
    });
    ctx.leaseHolderId = batchId;
    ctx.leaseStream = { publishTarget: batch.publishTarget, environment: batch.environment, publishType: batch.publishType };
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
          if (rd == null && row.action !== 'delete') throw new Error('Row data not found');
          if (row.action === 'insert') await insertRemoteRow(tx, tn, rd, 'insert');
          else if (row.action === 'update') {
            if (tn !== 'cards') await deleteRemoteRow(tx, tn, parseRowKey(row.rowKey));
            await insertRemoteRow(tx, tn, rd, 'update');
          } else if (row.action === 'delete') await deleteRemoteRow(tx, tn, parseRowKey(row.rowKey));
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          throw new Error(`Row apply failed: ${row.tableName} ${row.rowKey} — ${msg}`);
        }
      }
    });

    if (ctx.leaseHolderId != null && ctx.leaseStream != null) {
      await renewRemotePublishLease(ctx.remoteDb as any, {
        publishTarget: ctx.leaseStream.publishTarget, environment: ctx.leaseStream.environment,
        publishType: ctx.leaseStream.publishType, leaseHolderId: ctx.leaseHolderId,
      });
    }
    for (const row of chunk) {
      await ctx.db.update(PublishBatchRow).set({
        status: row.action === 'unchanged' ? 'skipped' : 'applied', updatedAt: new Date(), appliedAt: new Date(),
      }).where(and(eq(PublishBatchRow.batchId, batchId), eq(PublishBatchRow.tableName, row.tableName as any), eq(PublishBatchRow.rowKey, row.rowKey)));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.db.update(PublishBatch).set({ error: msg, updatedAt: new Date() }).where(eq(PublishBatch.id, batchId));
    throw error;
  }

  ctx.appliedCount = (ctx.appliedCount ?? 0) + chunk.length;
  progress({ done: ctx.appliedCount, total: ctx.pendingRowCount });
  return { cursor: nextCursor, processed: ctx.appliedCount };
}

// ── update_baseline block ──

interface ReanchorState {
  manifest: Bun.CryptoHasher;
  builds: Set<number>;
  totalRowCount: number;
  completed: number;
  publishedAt: Date;
  scanCursors: Map<string, any | null>;
}

async function baselineBlock(
  ctx: PublishCtx, batchId: string, reanchor: ReanchorState, blockInput: BaselineBlockInput, progress: ProgressFn<'bounded'>,
  done: (finalBlockInput: any) => BlockDone,
): Promise<BaselineBlockInput | BlockDone> {
  const tables: TableName[] = ['entities', 'entity_localizations', 'entity_relations', 'cards'];
  const db = getLocalDb() as unknown as PublishDb;

  let tableName: TableName | null = null;
  for (const tn of tables) { if (reanchor.scanCursors.get(tn) !== undefined) { tableName = tn; break; } }
  if (!tableName) return done(blockInput);

  const cursor = reanchor.scanCursors.get(tableName)!;
  let rawRows: any[];
  if (tableName === 'entities') {
    rawRows = await db.select().from(LocalEntity).where(cursor == null ? undefined : sql`(${LocalEntity.cardId}, ${LocalEntity.revisionHash}) > (${cursor.cardId}, ${cursor.revisionHash})`)
      .orderBy(asc(LocalEntity.cardId), asc(LocalEntity.revisionHash)).limit(reanchorReadBatchSize) as any[];
  } else if (tableName === 'entity_localizations') {
    rawRows = await db.select().from(LocalEntityLocalization).where(cursor == null ? undefined : sql`(${LocalEntityLocalization.cardId}, ${LocalEntityLocalization.lang}, ${LocalEntityLocalization.revisionHash}, ${LocalEntityLocalization.localizationHash}) > (${cursor.cardId}, ${cursor.lang}, ${cursor.revisionHash}, ${cursor.localizationHash})`)
      .orderBy(asc(LocalEntityLocalization.cardId), asc(LocalEntityLocalization.lang), asc(LocalEntityLocalization.revisionHash), asc(LocalEntityLocalization.localizationHash)).limit(reanchorReadBatchSize) as any[];
  } else if (tableName === 'entity_relations') {
    rawRows = await db.select().from(LocalEntityRelation).where(cursor == null ? undefined : sql`(${LocalEntityRelation.sourceId}, ${LocalEntityRelation.relation}, ${LocalEntityRelation.targetId}, ${LocalEntityRelation.sourceRevisionHash}) > (${cursor.sourceId}, ${cursor.relation}, ${cursor.targetId}, ${cursor.sourceRevisionHash})`)
      .orderBy(asc(LocalEntityRelation.sourceId), asc(LocalEntityRelation.relation), asc(LocalEntityRelation.targetId), asc(LocalEntityRelation.sourceRevisionHash)).limit(reanchorReadBatchSize) as any[];
  } else {
    rawRows = await db.select().from(LocalCard).where(cursor == null ? undefined : sql`(${LocalCard.cardId}) > (${cursor.cardId})`)
      .orderBy(asc(LocalCard.cardId)).limit(reanchorReadBatchSize) as any[];
  }

  if (rawRows.length > 0) {
    const baselineRows = rawRows.map((row: any) => {
      const rk = rowKeyOf(row, tableName!);
      const rh = rowHashOf(row, tableName!);
      reanchor.manifest.update(buildManifestLine({ tableName: tableName!, rowKey: rk, rowHash: rh }));
      if (tableName === 'entities' && row.version) (row.version as number[]).forEach(v => reanchor.builds.add(v));
      return {
        publishTarget: ctx.stream.publishTarget, environment: ctx.stream.environment, publishType: ctx.stream.publishType,
        tableName: tableName!, rowKey: rk, rowHash: rh,
        publishedAt: reanchor.publishedAt, createdAt: reanchor.publishedAt, updatedAt: reanchor.publishedAt,
      };
    });
    await db.insert(PublishRowBaseline).values(baselineRows);
    reanchor.scanCursors.set(tableName, rawRows[rawRows.length - 1]);
    reanchor.completed += rawRows.length;
    progress({ done: reanchor.completed, total: reanchor.totalRowCount });
  } else {
    reanchor.scanCursors.set(tableName, undefined!);
  }

  return { tableName, cursor: rawRows.length > 0 ? rawRows[rawRows.length - 1] : blockInput.cursor, processed: reanchor.completed };
}

// ── DSL definition ──

export const publishTaskDefinition = createDefinition('hsdata_publish', { version: '2026-06-22:v1' })
  .scope(
    z.object({
      publishTarget: z.string(),
      environment: z.string(),
      publishType: z.string(),
    }),
    {
      type: 'publish_stream' as const,
      resolve: (scope) => ({
        key: `${scope.publishTarget}:${scope.environment}:${scope.publishType}`,
        snapshot: scope,
      }),
    },
  )
  .input(z.object({
    dryRun: z.boolean().optional(),
    operationKind: z.enum(['publish', 'revert']),
  }))
  .output(z.object({
    manifestHash: z.string(),
    publishedAt: z.iso.datetime(),
    buildMin: z.number(),
    buildMax: z.number(),
    batchId: z.string(),
    publishTarget: z.string(),
    environment: z.string(),
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
  }))
  .context({
    init: (input, scope): PublishCtx => {
      const target = requireHearthstonePublishTargetByIdentity(scope.publishTarget, scope.environment);
      return {
        db: getLocalDb() as unknown as PublishDb,
        dryRun: input.dryRun ?? false,
        operationKind: input.operationKind,
        stream: { publishTarget: target.publishTarget, environment: target.environment, publishType: 'card_data', targetFingerprint: target.targetFingerprint },
        pendingRowCount: 0,
      };
    },
  })

  // ── Stage 1: loading_snapshots (chunked, bounded) ──
  .stage('loading_snapshots', { label: 'Load & diff', progressMode: 'bounded' })
    .entry(async ({ ctx }) => {
      console.log('[publish] loading entry START, ctx.dryRun =', ctx.dryRun);
      const { stream } = ctx;
      const db = getLocalDb();
      const { baseline, baselineRowHashes } = await loadBaselineRowHashes(db, stream);

      // Auto-resume: detect incomplete publish batch
      if (!ctx.dryRun) {
        const incomplete = await db.select().from(PublishBatch)
          .where(and(
            eq(PublishBatch.status, 'applying'), eq(PublishBatch.publishTarget, stream.publishTarget),
            eq(PublishBatch.environment, stream.environment), eq(PublishBatch.publishType, stream.publishType),
            eq(PublishBatch.operationKind, 'publish'),
          )).orderBy(desc(PublishBatch.createdAt)).then(r => r[0] ?? null);

        if (incomplete) {
          const [pendingRow] = await db.select({ count: count() }).from(PublishBatchRow)
            .where(and(eq(PublishBatchRow.batchId, incomplete.id), eq(PublishBatchRow.status, 'pending')));
          const pendingCount = Number(pendingRow!.count);
          if (pendingCount > 0) {
            ctx.batchId = incomplete.id;
            ctx.pendingRowCount = pendingCount;
            return {
              blockInput: { cursor: null, processed: 0 } as LoadingBlockInput,
            };
          }
        }
      }

      const active = await findActiveStreamBatch(db, stream);
      if (active) throw new Error(`Active publish batch ${active.id} (${active.operationKind}) exists for this stream.`);

      const publishedAt = baseline?.publishedAt ?? null;
      const isIncremental = publishedAt != null;
      const since = publishedAt!;
      type BaseTable = typeof LocalBaseEntity | typeof LocalBaseEntityLocalization | typeof LocalBaseEntityRelation | typeof LocalBaseCard;
      const incFilter = (tbl: BaseTable) => or(and(isNull(tbl.deletedAt), or(gt(tbl.createdAt, since), gt(tbl.updatedAt, since))), gt(tbl.deletedAt, since));
      const fullFilter = (tbl: BaseTable) => isNull(tbl.deletedAt);
      const cnt = await Promise.all([
        isIncremental ? db.select({ count: count() }).from(LocalBaseEntity).where(incFilter(LocalBaseEntity)) : db.select({ count: count() }).from(LocalBaseEntity).where(fullFilter(LocalBaseEntity)),
        isIncremental ? db.select({ count: count() }).from(LocalBaseEntityLocalization).where(incFilter(LocalBaseEntityLocalization)) : db.select({ count: count() }).from(LocalBaseEntityLocalization).where(fullFilter(LocalBaseEntityLocalization)),
        isIncremental ? db.select({ count: count() }).from(LocalBaseEntityRelation).where(incFilter(LocalBaseEntityRelation)) : db.select({ count: count() }).from(LocalBaseEntityRelation).where(fullFilter(LocalBaseEntityRelation)),
        isIncremental ? db.select({ count: count() }).from(LocalBaseCard).where(incFilter(LocalBaseCard)) : db.select({ count: count() }).from(LocalBaseCard).where(fullFilter(LocalBaseCard)),
      ]);
      const totalRows = cnt.reduce((s, r) => s + Number(r[0]!.count), 0);
      const tableTotals: Record<string, number> = {
        entities: Number(cnt[0]![0]!.count), entity_localizations: Number(cnt[1]![0]!.count),
        entity_relations: Number(cnt[2]![0]!.count), cards: Number(cnt[3]![0]!.count),
      };

      const batchId = ctx.dryRun ? crypto.randomUUID() : '';
      if (!ctx.dryRun) {
        const [created] = await db.insert(PublishBatch).values({
          publishTarget: stream.publishTarget, environment: stream.environment,
          targetFingerprint: stream.targetFingerprint, publishType: 'card_data', operationKind: 'publish',
          buildMin: 1, buildMax: 1,
          generationFingerprint: publishCardDataGeneration.fingerprint, generationOrder: publishCardDataGeneration.order,
          manifestHash: '', previousManifestHash: baseline?.manifestHash ?? null,
          status: 'applying', startedAt: new Date(),
        }).returning({ id: PublishBatch.id });
        ctx.batchId = created!.id;
      console.log('[publish] loading entry set batchId =', ctx.batchId);
      }

      ctx.loader = {
        baselineRowHashes, previousManifestHash: baseline?.manifestHash ?? null,
        previousRange: baseline ? { buildMin: baseline.buildMin, buildMax: baseline.buildMax } : null,
        publishedAt, batchId, counts: emptyCounts(), builds: [], processed: 0, totalRows,
        scanCursors: new Map([['entities', null], ['entity_localizations', null], ['entity_relations', null], ['cards', null]]),
        tableTotals,
        tableProcessed: tableTotals ? { entities: 0, entity_localizations: 0, entity_relations: 0, cards: 0 } : undefined as any,
      };

      return {
        total: totalRows,
        blockInput: { cursor: null, processed: 0 } as LoadingBlockInput,
      };
    })
    .block(async ({ ctx, blockInput, progress, done }) => {
      if (!ctx.loader) return done(blockInput);
      return loadingBlock(ctx, ctx.loader, blockInput, progress, done);
    })
    .exit(async ({ ctx }) => {
      const l = ctx.loader;
      return {
        batchId: ctx.batchId!,
        pendingRowCount: ctx.pendingRowCount ?? 0,
        counts: l?.counts ?? emptyCounts(),
        builds: l?.builds ?? [],
        previousRange: l?.previousRange ?? null,
        totalRows: l?.totalRows ?? 0,
      } as LoadingOutput;
    })

  // ── Stage 2: applying_remote (chunked, bounded, skip on dryRun) ──
  .stage('applying_remote', { label: 'Apply to remote', progressMode: 'bounded' })
    .enable({
      when: (input) => !input.dryRun,
      otherwise: (_input) => ({ batchId: '', pendingRowCount: 0, counts: emptyCounts(), builds: [], previousRange: null, totalRows: 0 } as ApplyingOutput),
    })
    .entry(async ({ ctx }) => {
      console.log('[publish] applying entry ctx.batchId =', ctx.batchId, 'pendingRowCount =', ctx.pendingRowCount);
      if (ctx.batchId != null) {
        const [pendingRow] = await getLocalDb().select({ count: count() }).from(PublishBatchRow)
          .where(and(eq(PublishBatchRow.batchId, ctx.batchId), eq(PublishBatchRow.status, 'pending')));
        ctx.pendingRowCount = Number(pendingRow!.count);
      }
      return {
        total: ctx.pendingRowCount,
        blockInput: { cursor: null, processed: 0 } as ApplyBlockInput,
      };
    })
    .block(async ({ ctx, blockInput, progress, done }) => {
      return applyingBlock(ctx, ctx.batchId!, blockInput, progress, done);
    })
    .exit(async ({ input }) => {
      return input as ApplyingOutput;
    })

  // ── Stage 3: update_baseline (chunked, bounded, skip on dryRun) ──
  .stage('update_baseline', { label: 'Update baseline', progressMode: 'bounded' })
    .enable({
      when: (input) => !input.dryRun,
      otherwise: (_input) => ({
        batchId: '', pendingRowCount: 0, counts: emptyCounts(), builds: [], previousRange: null, totalRows: 0, manifestHash: '',
      } as BaselineOutput),
    })
    .entry(async ({ ctx }) => {
      const db = getLocalDb() as unknown as PublishDb;
      const batchId = ctx.batchId!;

      const [pendingRow] = await db.select({ count: count() }).from(PublishBatchRow)
        .where(and(eq(PublishBatchRow.batchId, batchId), eq(PublishBatchRow.status, 'pending')));
      if (Number(pendingRow!.count) > 0) {
        throw new Error(`Publish batch ${batchId} has ${pendingRow!.count} pending rows before baseline update.`);
      }

      const counts = await loadReanchorRowCounts(db);
      await db.delete(PublishRowBaseline).where(and(
        eq(PublishRowBaseline.publishTarget, ctx.stream.publishTarget),
        eq(PublishRowBaseline.environment, ctx.stream.environment),
        eq(PublishRowBaseline.publishType, ctx.stream.publishType),
      ));

      ctx.reanchor = {
        manifest: new Bun.CryptoHasher('sha256'), builds: new Set(),
        totalRowCount: counts.totalRowCount, completed: 0,
        publishedAt: new Date(),
        scanCursors: new Map([['entities', null], ['entity_localizations', null], ['entity_relations', null], ['cards', null]]),
      };

      return {
        total: counts.totalRowCount,
        blockInput: { tableName: null, cursor: null, processed: 0 } as BaselineBlockInput,
      };
    })
    .block(async ({ ctx, blockInput, progress, done }) => {
      if (!ctx.reanchor) return done(blockInput);
      return baselineBlock(ctx, ctx.batchId!, ctx.reanchor, blockInput, progress, done);
    })
    .exit(async ({ input }) => {
      return {
        ...input as LoadingOutput,
        manifestHash: '',
      } as BaselineOutput;
    })

  // ── Stage 4: finalizing (simple) ──
  .stage('finalizing', { label: 'Finalize', progressMode: 'simple' })
    .handler(async ({ ctx, input }) => {
      const { batchId, counts } = input;
      console.log(`[publish done] dryRun=${ctx.dryRun} total=${counts.totalRowCount} insert=${counts.insertedRowCount} update=${counts.updatedRowCount} delete=${counts.deletedRowCount} unchanged=${counts.unchangedRowCount}`);

      const localDb = getLocalDb() as unknown as PublishDb;
      const batch = batchId
        ? await localDb.select().from(PublishBatch).where(eq(PublishBatch.id, batchId)).then(r => r[0] ?? null)
        : null;
      const publishedAt = new Date();
      const range = batch
        ? await derivePublishDatasetRange(localDb, [input.builds], input.previousRange)
        : null;
      const totalRowCount = counts.totalRowCount ?? batch?.totalRowCount ?? 0;

      if (batchId && batch) {
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
              throw new Error(`Row count mismatch for ${tableName}: local=${localRow!.count} remote=${remoteRow!.count}`);
            }
          }
        } finally {
          if (!ctx.remoteDb) await remoteDb.$client.end({ timeout: 1 });
        }

        if (ctx.remoteDb) {
          await (ctx.remoteDb as any).transaction(async (tx: any) => {
            await upsertRemotePublishLedger(tx, {
              batchId: batch.id, publishTarget: batch.publishTarget, environment: batch.environment,
              targetFingerprint: batch.targetFingerprint, publishType: batch.publishType,
              range: { buildMin: batch.buildMin, buildMax: batch.buildMax },
              generationFingerprint: batch.generationFingerprint, generationOrder: batch.generationOrder,
              counts: {
                totalRowCount: batch.totalRowCount, changedRowCount: batch.changedRowCount,
                insertedRowCount: batch.insertedRowCount, updatedRowCount: batch.updatedRowCount,
                deletedRowCount: batch.deletedRowCount, unchangedRowCount: batch.unchangedRowCount,
                cardRowCount: batch.cardRowCount, entityRowCount: batch.entityRowCount,
                localizationRowCount: batch.localizationRowCount, relationRowCount: batch.relationRowCount,
              },
              manifestHash: batch.manifestHash, publishedAt,
            });
            if (ctx.leaseHolderId != null && ctx.leaseStream != null) {
              await tx.update(PublishStreamRegistration).set({
                leaseHolderId: null, leaseExpiresAt: null, updatedAt: new Date(),
              }).where(and(
                eq(PublishStreamRegistration.publishTarget, ctx.leaseStream.publishTarget),
                eq(PublishStreamRegistration.environment, ctx.leaseStream.environment),
                eq(PublishStreamRegistration.publishType, ctx.leaseStream.publishType),
                eq(PublishStreamRegistration.leaseHolderId, ctx.leaseHolderId),
              ));
            }
          });
        }
      }

      if (batchId && batch) {
        const finalRange = range ?? { buildMin: batch.buildMin, buildMax: batch.buildMax };
        await localDb.transaction(async (tx) => {
          await tx.insert(PublishBaseline).values({
            publishTarget: batch.publishTarget, environment: batch.environment, publishType: batch.publishType,
            targetFingerprint: batch.targetFingerprint, batchId,
            buildMin: finalRange.buildMin, buildMax: finalRange.buildMax,
            generationFingerprint: publishCardDataGeneration.fingerprint, generationOrder: publishCardDataGeneration.order,
            manifestHash: batch.manifestHash, totalRowCount, publishedAt,
            createdAt: publishedAt, updatedAt: publishedAt,
          }).onConflictDoUpdate({
            target: [PublishBaseline.publishTarget, PublishBaseline.environment, PublishBaseline.publishType],
            set: {
              batchId, buildMin: finalRange.buildMin, buildMax: finalRange.buildMax,
              generationFingerprint: publishCardDataGeneration.fingerprint, generationOrder: publishCardDataGeneration.order,
              manifestHash: batch.manifestHash, totalRowCount, publishedAt, updatedAt: publishedAt,
            } as any,
          });

          const summary = {
            batchId: batch.id, publishTarget: batch.publishTarget, environment: batch.environment,
            totalRowCount: batch.totalRowCount, changedRowCount: batch.changedRowCount,
            insertedRowCount: batch.insertedRowCount, updatedRowCount: batch.updatedRowCount,
            deletedRowCount: batch.deletedRowCount, unchangedRowCount: batch.unchangedRowCount,
            cardRowCount: batch.cardRowCount, entityRowCount: batch.entityRowCount,
            localizationRowCount: batch.localizationRowCount, relationRowCount: batch.relationRowCount,
            publishedAt: publishedAt.toISOString(),
          };
          await tx.update(PublishBatch).set({
            status: 'completed' as any, completedAt: publishedAt as any, updatedAt: publishedAt, summary: summary as any,
          }).where(eq(PublishBatch.id, batchId));
        });

        const oldIds = await localDb.select({ id: PublishBatch.id }).from(PublishBatch)
          .where(and(
            eq(PublishBatch.publishTarget, batch.publishTarget), eq(PublishBatch.environment, batch.environment),
            eq(PublishBatch.publishType, batch.publishType), eq(PublishBatch.status, 'completed'), ne(PublishBatch.id, batchId),
          )).then(r => r.map(x => x.id));
        if (oldIds.length > 0) await localDb.delete(PublishBatchRow).where(inArray(PublishBatchRow.batchId, oldIds));
      }

      const publishResultStatus = ctx.dryRun ? 'dry_run' : 'completed';

      return {
        manifestHash: batch?.manifestHash ?? '',
        publishedAt: publishedAt.toISOString(),
        buildMin: range?.buildMin ?? 0,
        buildMax: range?.buildMax ?? 0,
        batchId: batch?.id ?? batchId ?? '',
        publishTarget: batch?.publishTarget ?? ctx.stream.publishTarget,
        environment: batch?.environment ?? ctx.stream.environment,
        totalRowCount: batch?.totalRowCount ?? counts.totalRowCount,
        changedRowCount: batch?.changedRowCount ?? counts.changedRowCount,
        insertedRowCount: batch?.insertedRowCount ?? counts.insertedRowCount,
        updatedRowCount: batch?.updatedRowCount ?? counts.updatedRowCount,
        deletedRowCount: batch?.deletedRowCount ?? counts.deletedRowCount,
        unchangedRowCount: batch?.unchangedRowCount ?? counts.unchangedRowCount,
        cardRowCount: batch?.cardRowCount ?? counts.cardRowCount,
        entityRowCount: batch?.entityRowCount ?? counts.entityRowCount,
        localizationRowCount: batch?.localizationRowCount ?? counts.localizationRowCount,
        relationRowCount: batch?.relationRowCount ?? counts.relationRowCount,
        publishType: batch?.publishType ?? ctx.stream.publishType,
        operationKind: batch?.operationKind ?? ctx.operationKind,
        dryRun: ctx.dryRun,
        status: publishResultStatus,
      };
    })
  .build();
