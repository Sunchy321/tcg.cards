import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { createDb } from '@tcg-cards/db';
import {
  Card,
  CardLocalization,
  CardPart,
  CardPartLocalization,
} from '@tcg-cards/db/schema/shared/magic/card';
import { Print, PrintPart } from '@tcg-cards/db/schema/shared/magic/print';
import {
  PublishBaseline,
  PublishBatch,
  PublishBatchRow,
  PublishRowBaseline,
} from '@tcg-cards/db/schema/local/magic';
import { PublishLedger, PublishStreamRegistration } from '@tcg-cards/db/schema/remote/publish';

export type PublishDb = ReturnType<typeof createDb>;

/** Remote publish lease TTL — one writer at a time per stream. */
const REMOTE_PUBLISH_LEASE_TTL_MS = 10 * 60 * 1000;
/** Local rows read per scan chunk. */
const SCAN_CHUNK_SIZE = 1000;
/** Remote rows applied per transaction. */
const APPLY_CHUNK_SIZE = 1000;

// ── Table registry ──

/** The six magic fact tables published as one card_data surface. Unified
 * localization is NOT published: it is projection-side annotation recording
 * how the unified facts were established, not a fact table itself. */
export const PUBLISH_TABLES = [
  'cards',
  'card_parts',
  'card_localizations',
  'card_part_localizations',
  'prints',
  'print_parts',
] as const;

export type PublishTableName = (typeof PUBLISH_TABLES)[number];

interface PublishTableConfig {
  name:  PublishTableName;
  table: any;
  /** PK column keys in key order; also the keyset scan order. */
  pk:    string[];
}

/** Per-table registry: drizzle table object (works against local and remote) + PK. */
export const PUBLISH_TABLE_CONFIG: Record<PublishTableName, PublishTableConfig> = {
  cards:                   { name: 'cards', table: Card, pk: ['cardId', 'version'] },
  card_parts:              { name: 'card_parts', table: CardPart, pk: ['cardId', 'version', 'partIndex'] },
  card_localizations:      { name: 'card_localizations', table: CardLocalization, pk: ['cardId', 'version', 'locale', 'source'] },
  card_part_localizations: { name: 'card_part_localizations', table: CardPartLocalization, pk: ['cardId', 'version', 'locale', 'source', 'partIndex'] },
  prints:                  { name: 'prints', table: Print, pk: ['cardId', 'version', 'set', 'number', 'lang', 'source'] },
  print_parts:             { name: 'print_parts', table: PrintPart, pk: ['cardId', 'version', 'set', 'number', 'lang', 'source', 'partIndex'] },
};

/** Columns excluded from row hashes: bookkeeping that changes on every write. */
const VOLATILE_COLUMNS = new Set(['createdAt', 'updatedAt', 'deletedAt']);

// ── Hashing ──

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Stable JSON hash of any value. */
export function hashJson(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}

/** Hashable projection of one row: every column except volatile bookkeeping. */
function hashableRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) {
    if (VOLATILE_COLUMNS.has(key)) continue;
    out[key] = row[key];
  }
  return out;
}

/** Deterministic row key: PK values joined in registry order. */
export function rowKeyOf(config: PublishTableConfig, row: Record<string, unknown>): string {
  return config.pk.map(name => String(row[name] ?? '')).join('|');
}

/** Stable row content hash. */
export function rowHashOf(config: PublishTableConfig, row: Record<string, unknown>): string {
  return hashJson(hashableRow(row));
}

/** Parse a serialized row key back into a PK record. */
export function parseRowKey(config: PublishTableConfig, serialized: string): Record<string, string> {
  const values = serialized.split('|');
  const out: Record<string, string> = {};
  config.pk.forEach((name, i) => {
    out[name] = values[i] ?? '';
  });
  return out;
}

// ── Local scan ──

/** Keyset-scans one local table in PK order; returns rows plus the next cursor. */
export async function scanLocalRows(
  database: PublishDb,
  config: PublishTableConfig,
  lastKey: string | null,
  limit = SCAN_CHUNK_SIZE,
): Promise<{ rows: Record<string, unknown>[], lastKey: string | null }> {
  const cols = config.pk.map(name => (config.table as any)[name]);
  const order = cols.map(col => asc(col));

  // Row-value comparison: (pk1, pk2, …) > (last1, last2, …) for keyset paging.
  const where = lastKey != null
    ? sql`(${sql.join(cols.map(col => sql`${col}`), sql`, `)}) > (${sql.join(
      config.pk.map(name => sql`${parseRowKey(config, lastKey)[name]}`),
      sql`, `,
    )})`
    : undefined;

  const rows = await database.select()
    .from(config.table)
    .where(where)
    .orderBy(...order)
    .limit(limit) as Record<string, unknown>[];

  const last = rows[rows.length - 1];
  return { rows, lastKey: last != null ? rowKeyOf(config, last) : lastKey };
}

/** Source-row count per published table (progress total). */
export async function countLocalRows(database: PublishDb): Promise<Record<PublishTableName, number>> {
  const out = {} as Record<PublishTableName, number>;
  for (const config of Object.values(PUBLISH_TABLE_CONFIG)) {
    const rows = await database.select({ n: sql<number>`count(*)::int` }).from(config.table);
    out[config.name] = Number(rows[0]?.n ?? 0);
  }
  return out;
}

/** Baseline row hashes for one stream: Map<rowKey, rowHash> per table. */
export async function loadBaselineHashes(
  database: PublishDb,
  stream: { publishTarget: string, environment: string, publishType: string },
): Promise<Map<PublishTableName, Map<string, string>>> {
  const out = new Map<PublishTableName, Map<string, string>>();
  for (const name of PUBLISH_TABLES) out.set(name, new Map());

  const batchSize = 10_000;
  for (let i = 0; ; i += batchSize) {
    const rows = await database.select({
      tableName: PublishRowBaseline.tableName,
      rowKey:    PublishRowBaseline.rowKey,
      rowHash:   PublishRowBaseline.rowHash,
    })
      .from(PublishRowBaseline)
      .where(and(
        eq(PublishRowBaseline.publishTarget, stream.publishTarget),
        eq(PublishRowBaseline.environment, stream.environment),
        eq(PublishRowBaseline.publishType, stream.publishType),
      ))
      .orderBy(asc(PublishRowBaseline.tableName), asc(PublishRowBaseline.rowKey))
      .limit(batchSize)
      .offset(i);
    if (rows.length === 0) break;
    for (const r of rows) {
      out.get(r.tableName as PublishTableName)?.set(r.rowKey, r.rowHash);
    }
    if (rows.length < batchSize) break;
  }
  return out;
}

// ── Batch lifecycle ──

export async function findActivePublishBatch(
  database: PublishDb,
  stream: { publishTarget: string, environment: string, publishType: string },
): Promise<typeof PublishBatch.$inferSelect | null> {
  return await database.select()
    .from(PublishBatch)
    .where(and(
      eq(PublishBatch.publishTarget, stream.publishTarget),
      eq(PublishBatch.environment, stream.environment),
      eq(PublishBatch.publishType, stream.publishType),
      inArray(PublishBatch.status, ['planning', 'applying']),
    ))
    .orderBy(sql`created_at desc`)
    .then(rows => rows[0] ?? null);
}

export async function createPublishBatch(
  database: PublishDb,
  input: {
    stream:               { publishTarget: string, environment: string, publishType: string };
    targetFingerprint:    string;
    operationKind:        'publish' | 'dry_run';
    manifestHash:         string;
    previousManifestHash: string | null;
    generationOrder:      number;
  },
): Promise<typeof PublishBatch.$inferSelect> {
  const rows = await database.insert(PublishBatch).values({
    publishTarget:         input.stream.publishTarget,
    environment:           input.stream.environment,
    targetFingerprint:     input.targetFingerprint,
    publishType:           input.stream.publishType,
    operationKind:         input.operationKind,
    generationFingerprint: 'magic-card-data/v1',
    generationOrder:       input.generationOrder,
    manifestHash:          input.manifestHash,
    previousManifestHash:  input.previousManifestHash,
    status:                'planning' as const,
  }).returning();
  return rows[0]!;
}

/** Persists diff plan rows for one batch (chunked insert). */
export async function insertBatchRows(
  database: PublishDb,
  batchId: string,
  rows: {
    tableName: PublishTableName; rowKey: string; rowHash: string; previousRowHash: string | null;
    action: 'insert' | 'update' | 'delete';
  }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += 1000) {
    await database.insert(PublishBatchRow).values(rows.slice(i, i + 1000).map(r => ({
      batchId:         batchId,
      tableName:       r.tableName,
      rowKey:          r.rowKey,
      rowHash:         r.rowHash,
      previousRowHash: r.previousRowHash,
      action:          r.action,
      status:          'pending' as const,
    })));
  }
}

// ── Remote stream registration / gate / lease ──

/** Ensures one remote publish stream registration exists (no-op when registered). */
export async function ensureRemotePublishRegistration(
  connectionString: string,
  input: { publishTarget: string, environment: string, publishType: string, targetFingerprint: string },
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

/** Asserts the remote gate (registration, fingerprint, lease, ledger lineage) and takes the lease. */
export async function assertRemotePublishGate(
  remoteDb: PublishDb,
  input: {
    publishTarget:        string;
    environment:          string;
    publishType:          string;
    targetFingerprint:    string;
    manifestHash:         string;
    previousManifestHash: string | null;
    generationOrder:      number;
    leaseHolderId:        string;
    force?:               boolean;
  },
): Promise<void> {
  const registration = await remoteDb.select()
    .from(PublishStreamRegistration)
    .where(and(
      eq(PublishStreamRegistration.publishTarget, input.publishTarget),
      eq(PublishStreamRegistration.environment, input.environment),
      eq(PublishStreamRegistration.publishType, input.publishType),
    ))
    .then(rows => rows[0] ?? null);

  if (registration == null) {
    throw new Error(`Remote publish stream ${input.publishTarget}/${input.environment} is not registered.`);
  }
  if (!registration.normalPublishEnabled) {
    throw new Error(`Remote publish stream ${input.publishTarget}/${input.environment} does not allow normal publish.`);
  }
  if (registration.targetFingerprint !== input.targetFingerprint) {
    throw new Error(`Remote publish stream ${input.publishTarget}/${input.environment} rejected target fingerprint ${input.targetFingerprint}.`);
  }

  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + REMOTE_PUBLISH_LEASE_TTL_MS);
  const leased = await remoteDb.update(PublishStreamRegistration)
    .set({ leaseHolderId: input.leaseHolderId, leaseExpiresAt, updatedAt: now })
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
    throw new Error(`Remote publish stream ${input.publishTarget}/${input.environment} is already leased by another publish batch.`);
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
  if (remoteManifestHash != null && remoteManifestHash !== input.previousManifestHash && !input.force) {
    throw new Error(`Remote baseline changed: expected ${input.previousManifestHash}, got ${remoteManifestHash}.`);
  }
  if (ledger != null && ledger.generationOrder > input.generationOrder && !input.force) {
    throw new Error(`Remote generationOrder regressed: incoming ${input.generationOrder}, remote ${ledger.generationOrder}.`);
  }
  if (
    ledger != null
    && ledger.generationOrder === input.generationOrder
    && ledger.manifestHash !== input.manifestHash
    && !input.force
  ) {
    throw new Error(`Remote manifest diverged on the same lineage: incoming ${input.manifestHash}, remote ${ledger.manifestHash}.`);
  }
}

/** Extends the lease while the same batch keeps making progress. */
export async function renewRemotePublishLease(
  remoteDb: PublishDb,
  input: { publishTarget: string, environment: string, publishType: string, leaseHolderId: string },
): Promise<void> {
  const now = new Date();
  const renewed = await remoteDb.update(PublishStreamRegistration)
    .set({ leaseExpiresAt: new Date(now.getTime() + REMOTE_PUBLISH_LEASE_TTL_MS), updatedAt: now })
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
    throw new Error(`Remote publish lease could not be renewed for ${input.leaseHolderId}.`);
  }
}

/** Releases the lease after the batch reaches a terminal state. */
export async function releaseRemotePublishLease(
  remoteDb: PublishDb,
  input: { publishTarget: string, environment: string, publishType: string, leaseHolderId: string },
): Promise<void> {
  await remoteDb.update(PublishStreamRegistration)
    .set({ leaseHolderId: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(
      eq(PublishStreamRegistration.publishTarget, input.publishTarget),
      eq(PublishStreamRegistration.environment, input.environment),
      eq(PublishStreamRegistration.publishType, input.publishType),
      eq(PublishStreamRegistration.leaseHolderId, input.leaseHolderId),
    ));
}

// ── Remote apply ──

/** Applies one plan row to the remote database inside the caller's transaction. */
async function applyPlanRow(
  tx: Parameters<Parameters<PublishDb['transaction']>[0]>[0],
  config: PublishTableConfig,
  plan: { action: string, rowKey: string },
  row: Record<string, unknown> | null,
): Promise<void> {
  if (plan.action === 'delete') {
    const pk = parseRowKey(config, plan.rowKey);
    await tx.delete(config.table).where(and(...config.pk.map(name => eq((config.table as any)[name], pk[name]!))));
    return;
  }
  if (row == null) throw new Error(`Local row for ${config.name}/${plan.rowKey} disappeared before apply`);
  await tx.insert(config.table)
    .values(row as never)
    .onConflictDoUpdate({
      target: config.pk.map(name => (config.table as any)[name]),
      set:    buildExcludedSet(config.table, row),
    });
}

/** Builds an on-conflict update set from a row, excluding PK columns, via EXCLUDED. */
function buildExcludedSet(table: any, row: Record<string, unknown>): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const col = (table as any)[key];
    if (col && col.name) {
      set[key] = sql`excluded.${sql.raw(col.name)}`;
    }
  }
  set.updatedAt = new Date();
  return set;
}

/** Loads local rows for plan keys of one table (re-read before apply). */
async function loadRowsForPlan(
  database: PublishDb,
  config: PublishTableConfig,
  rowKeys: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  if (rowKeys.length === 0) return out;

  // Match on the full PK tuple set via OR of AND-ed PK equality — chunked to
  // stay well under the statement parameter budget.
  for (let i = 0; i < rowKeys.length; i += 200) {
    const chunk = rowKeys.slice(i, i + 200);
    const conditions = chunk.map(key => {
      const pk = parseRowKey(config, key);
      return and(...config.pk.map(name => eq((config.table as any)[name], pk[name]!)));
    });
    const rows = await database.select()
      .from(config.table)
      .where(or(...conditions)) as Record<string, unknown>[];
    for (const row of rows) {
      out.set(rowKeyOf(config, row), row);
    }
  }
  return out;
}

/**
 * Applies one chunk of plan rows to the remote database in a single transaction
 * and marks them applied. Re-running skips rows already marked applied.
 */
export async function applyPlanChunk(
  database: PublishDb,
  remoteDb: PublishDb,
  stream: { publishTarget: string, environment: string, publishType: string },
  batchId: string,
  leaseHolderId: string,
): Promise<number> {
  const pending = await database.select()
    .from(PublishBatchRow)
    .where(and(
      eq(PublishBatchRow.batchId, batchId),
      eq(PublishBatchRow.status, 'pending'),
    ))
    .orderBy(asc(PublishBatchRow.tableName), asc(PublishBatchRow.rowKey))
    .limit(APPLY_CHUNK_SIZE);
  if (pending.length === 0) return 0;

  const byTable = new Map<PublishTableName, typeof pending>();
  for (const row of pending) {
    const list = byTable.get(row.tableName as PublishTableName) ?? [];
    list.push(row);
    byTable.set(row.tableName as PublishTableName, list);
  }

  await remoteDb.transaction(async tx => {
    for (const [tableName, planRows] of byTable) {
      const config = PUBLISH_TABLE_CONFIG[tableName];
      const upsertKeys = planRows.filter(r => r.action !== 'delete').map(r => r.rowKey);
      const localRows = await loadRowsForPlan(database, config, upsertKeys);
      for (const plan of planRows) {
        await applyPlanRow(tx, config, plan, localRows.get(plan.rowKey) ?? null);
      }
    }
  });

  const now = new Date();
  for (const plan of pending) {
    await database.update(PublishBatchRow)
      .set({ status: 'applied', appliedAt: now, updatedAt: now })
      .where(and(
        eq(PublishBatchRow.batchId, batchId),
        eq(PublishBatchRow.tableName, plan.tableName),
        eq(PublishBatchRow.rowKey, plan.rowKey),
      ));
  }

  await renewRemotePublishLease(remoteDb, { ...stream, leaseHolderId });
  return pending.length;
}

// ── Baseline / ledger finalization ──

/** Rolls the applied plan into the local row baseline and stream baseline. */
export async function updateBaseline(
  database: PublishDb,
  stream: { publishTarget: string, environment: string, publishType: string },
  batch: typeof PublishBatch.$inferSelect,
  plan: { tableName: string, rowKey: string, rowHash: string, action: string }[],
): Promise<void> {
  for (let i = 0; i < plan.length; i += 1000) {
    const chunk = plan.slice(i, i + 1000);
    for (const p of chunk) {
      if (p.action === 'delete') {
        await database.delete(PublishRowBaseline).where(and(
          eq(PublishRowBaseline.publishTarget, stream.publishTarget),
          eq(PublishRowBaseline.environment, stream.environment),
          eq(PublishRowBaseline.publishType, stream.publishType),
          eq(PublishRowBaseline.tableName, p.tableName),
          eq(PublishRowBaseline.rowKey, p.rowKey),
        ));
      } else {
        await database.insert(PublishRowBaseline).values({
          publishTarget: stream.publishTarget,
          environment:   stream.environment,
          publishType:   stream.publishType,
          tableName:     p.tableName,
          rowKey:        p.rowKey,
          rowHash:       p.rowHash,
          sourceBatchId: batch.id,
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
            rowHash:       p.rowHash,
            sourceBatchId: batch.id,
            publishedAt:   new Date(),
            updatedAt:     new Date(),
          },
        });
      }
    }
  }

  await database.insert(PublishBaseline).values({
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
}

/** Upserts the remote publish ledger after a successful batch. */
export async function upsertRemotePublishLedger(
  remoteDb: PublishDb,
  batch: typeof PublishBatch.$inferSelect,
): Promise<void> {
  await remoteDb.insert(PublishLedger).values({
    publishTarget:         batch.publishTarget,
    environment:           batch.environment,
    publishType:           batch.publishType,
    targetFingerprint:     batch.targetFingerprint,
    batchId:               batch.id,
    // The shared ledger schema carries the hearthstone build range; magic has
    // no build concept, so the placeholder range satisfies the NOT NULL gates.
    buildMin:              1,
    buildMax:              1,
    generationFingerprint: batch.generationFingerprint,
    generationOrder:       batch.generationOrder,
    manifestHash:          batch.manifestHash,
    totalRowCount:         batch.totalRowCount,
    changedRowCount:       batch.changedRowCount,
    publishedAt:           new Date(),
  }).onConflictDoUpdate({
    target: [
      PublishLedger.publishTarget,
      PublishLedger.environment,
      PublishLedger.publishType,
    ],
    set: {
      targetFingerprint:     batch.targetFingerprint,
      batchId:               batch.id,
      generationFingerprint: batch.generationFingerprint,
      generationOrder:       batch.generationOrder,
      manifestHash:          batch.manifestHash,
      totalRowCount:         batch.totalRowCount,
      changedRowCount:       batch.changedRowCount,
      publishedAt:           new Date(),
      updatedAt:             new Date(),
    },
  });
}
