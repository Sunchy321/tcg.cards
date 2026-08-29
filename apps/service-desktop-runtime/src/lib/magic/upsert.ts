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
 * identical are skipped by the change WHERE and counted as unchanged.
 */
export async function upsertBatch<T>(
  database: any,
  table: any,
  batch: T[],
  target: any,
  pkNames: string[],
): Promise<UpsertCounts> {
  const first = batch[0] as unknown as Record<string, unknown>;
  const set = buildExcludedSet(table, first, pkNames);
  const where = buildChangeWhere(table, first, pkNames);
  const rows = await database.insert(table).values(batch as never)
    .onConflictDoUpdate({ target, set, where })
    .returning({ __xmax: sql`xmax` });
  const inserted = rows.filter((row: { __xmax: number }) => row.__xmax === 0).length;
  const updated = rows.length - inserted;
  const unchanged = batch.length - rows.length;
  return { inserted, updated, unchanged };
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
