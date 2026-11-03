import type { SearchSnapshotReader } from './snapshot-reader';

/** Minimal structural shape of a SQLite driver handle, shared by both runtime adapters. */
type SqliteDatabase = {
  prepare(sql: string): {
    iterate(): Iterable<Record<string, unknown>>;
    all(): Record<string, unknown>[];
  };
  close(): void;
};

/** Builds the driver-independent reader behavior on top of one opened SQLite handle. */
export function createSearchSnapshotReader(database: SqliteDatabase, metaTable: string): SearchSnapshotReader {
  return {
    readMeta() {
      const rows = database.prepare(`SELECT key, value FROM "${metaTable}"`).all();
      return new Map(rows.map(row => [String(row.key), String(row.value)]));
    },

    tableColumns(table) {
      const columns = database.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all()
        .map(row => String(row.name));
      if (columns.length === 0) throw new Error(`The search package is missing the "${table}" table.`);
      return columns;
    },

    iterateRows(table, where) {
      const columns = this.tableColumns(table);
      const selected = columns.map(name => `"${name.replaceAll('"', '""')}"`).join(', ');
      const filter = where == null ? '' : ` WHERE ${where}`;
      return database.prepare(`SELECT ${selected} FROM "${table.replaceAll('"', '""')}"${filter} ORDER BY rowid`)
        .iterate();
    },

    close() {
      database.close();
    },
  };
}
