import { createSearchSnapshotReader } from './create-snapshot-reader';
import type { SearchSnapshotReader } from './snapshot-reader';

/** Structural shape of Node's built-in `node:sqlite` connection used for package reads. */
type NodeSqliteDatabase = {
  prepare(sql: string): {
    iterate(): Iterable<Record<string, unknown>>;
    all(): Record<string, unknown>[];
  };
  close(): void;
};

type NodeSqliteDatabaseConstructor = new (
  path: string,
  options?: { readOnly?: boolean },
) => NodeSqliteDatabase;

/** Opens one exported search package through Node's built-in SQLite driver. */
export async function openSearchSnapshotReaderNodeSqlite(
  path: string,
  game: 'magic' | 'hearthstone',
): Promise<SearchSnapshotReader> {
  // The built-in module only exists under Node; the indirect specifier keeps it out of Bun typechecks.
  const specifier = 'node:sqlite';
  const module = await import(specifier) as unknown as {
    DatabaseSync: NodeSqliteDatabaseConstructor;
  };
  const database = new module.DatabaseSync(path, { readOnly: true });
  return createSearchSnapshotReader(database, `${game}_search_meta`);
}
