import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Reads the FTS5 virtual-table definition shared by D1 and local search packages. */
export async function hearthstoneSearchFtsSql(): Promise<string> {
  return await readFile(
    fileURLToPath(import.meta.resolve('@tcg-cards/db/schema/sqlite/hearthstone/search-fts.sql')),
    'utf8',
  );
}
