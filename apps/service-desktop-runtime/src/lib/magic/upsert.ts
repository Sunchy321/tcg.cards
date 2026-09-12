import { isNull, sql, type Column, type SQL } from 'drizzle-orm';

/** Builds the on-conflict update set from a row, excluding the PK, via EXCLUDED. */
export function buildExcludedSet(table: any, row: Record<string, unknown>, pkNames: string[]): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (pkNames.includes(key)) continue;
    const col = (table as any)[key];
    if (col && col.name) {
      set[key] = sql`excluded.${sql.raw(col.name)}`;
    }
  }
  set.updatedAt = new Date();
  set.deletedAt = null;
  return set;
}

/** WHERE clause that only matches when a stored data column actually differs. */
function buildChangeWhere(table: any, row: Record<string, unknown>, pkNames: string[]): SQL {
  const conditions: SQL[] = [];
  for (const key of Object.keys(row)) {
    if (pkNames.includes(key)) continue;
    const col = (table as any)[key];
    if (col && col.name) {
      conditions.push(sql`${table[key]} IS DISTINCT FROM EXCLUDED.${sql.raw(col.name)}`);
    }
  }
  return conditions.length > 0 ? sql.join(conditions, sql` OR `) : sql`true`;
}

/** Insert / update / unchanged counts from one upsert batch. */
export interface UpsertCounts {
  inserted:  number;
  updated:   number;
  unchanged: number;
}

/** Full import report for one table: insert / update / unchanged / soft-delete. */
export interface ImportCounts extends UpsertCounts {
  deleted: number;
}

/**
 * Upserts one batch. `xmax` is 0 for rows that were newly inserted and non-zero
 * for rows that matched the conflict and were updated; rows whose data was
 * identical are skipped by the change WHERE and counted as unchanged. Batches
 * are split internally by a bind-parameter budget — postgres.js caps one
 * statement at 65534 parameters, and heavily printed cards (basic lands) yield
 * thousands of rows per unit.
 */
export async function upsertBatch<T>(
  database: any,
  table: any,
  batch: T[],
  target: any,
  pkNames: string[],
): Promise<UpsertCounts> {
  if (batch.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };
  const first = batch[0] as unknown as Record<string, unknown>;
  const set = buildExcludedSet(table, first, pkNames);
  const where = buildChangeWhere(table, first, pkNames);
  const chunkSize = Math.max(1, Math.floor(60_000 / Object.keys(first).length));

  const counts: UpsertCounts = { inserted: 0, updated: 0, unchanged: 0 };
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize) as never[];
    const rows = await database.insert(table).values(chunk)
      .onConflictDoUpdate({ target, set, where })
      .returning({ __xmax: sql`xmax` });
    const inserted = rows.filter((row: { __xmax: number }) => row.__xmax === 0).length;
    counts.inserted += inserted;
    counts.updated += rows.length - inserted;
    counts.unchanged += chunk.length - rows.length;
  }
  return counts;
}

/**
 * Soft-deletes rows whose PK is not among the freshly imported keys. Handles both
 * single and composite primary keys: `pkNames` are the JS column keys used to build
 * a `|`-joined composite key, and the WHERE uses a tuple equality on the PK columns.
 */
export async function softDeleteMissing(
  database: any,
  table: any,
  pkColumns: Column[],
  pkNames: string[],
  importedKeys: Set<string>,
): Promise<number> {
  const select = Object.fromEntries(pkColumns.map((col, i) => [pkNames[i], col]));
  const existing = await database.select(select).from(table).where(isNull(table.deletedAt));

  const keyOf = (row: Record<string, unknown>) => pkNames.map(name => String((row as any)[name])).join('|');
  const missing = existing.filter((row: Record<string, unknown>) => !importedKeys.has(keyOf(row)));

  let count = 0;
  for (const row of missing) {
    const cols = sql.join(pkColumns.map(col => sql`${col}`), sql`, `);
    const values = sql.join(pkNames.map(name => sql`${(row as any)[name]}`), sql`, `);
    await database.update(table)
      .set({ deletedAt: new Date() })
      .where(sql`(${cols}) = (${values})`);
    count++;
  }
  return count;
}
