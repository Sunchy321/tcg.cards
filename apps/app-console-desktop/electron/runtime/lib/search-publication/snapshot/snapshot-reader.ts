/**
 * One opened read-only search package ready for snapshot generation.
 * Implementations exist for Node (`node:sqlite`) and Bun (`bun:sqlite`) so the
 * same generators run inside the desktop console and the site export scripts.
 */
export type SearchSnapshotReader = {
  /** Reads the package key/value metadata table into a keyed map. */
  readMeta(): Map<string, string>;

  /** Lists one table's column names in declared order. */
  tableColumns(table: string): string[];

  /** Iterates one table's rows in stable rowid order, optionally filtered. */
  iterateRows(table: string, where?: string): Iterable<Record<string, unknown>>;

  /** Releases the underlying database handle. */
  close(): void;
};
