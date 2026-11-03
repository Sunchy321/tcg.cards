import { createSearchSnapshotReader } from './create-snapshot-reader';
import type { SearchSnapshotReader } from './snapshot-reader';

/** Structural shape of Bun's `bun:sqlite` connection used for package reads. */
type BunSqliteDatabase = {
  prepare(sql: string): {
    iterate(): Iterable<Record<string, unknown>>;
    all(): Record<string, unknown>[];
  };
  close(): void;
};

type BunSqliteDatabaseConstructor = new (
  path: string,
  options?: { readonly?: boolean },
) => BunSqliteDatabase;

/** Opens one exported search package through Bun's native SQLite driver. */
export async function openSearchSnapshotReaderBunSqlite(
  path: string,
  game: 'magic' | 'hearthstone',
): Promise<SearchSnapshotReader> {
  // The native module only exists under Bun; the indirect specifier keeps it out of Node typechecks.
  const specifier = 'bun:sqlite';
  const module = await import(specifier) as unknown as {
    Database: BunSqliteDatabaseConstructor;
  };
  const database = new module.Database(path, { readonly: true });
  return createSearchSnapshotReader(database, `${game}_search_meta`);
}
