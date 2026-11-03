import { sql } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';

import { rebuildMagicSearchData } from '../electron/runtime/lib/magic/project/search-data';

// One-off maintenance entry: refreshes the Magic search projection (search
// tables, cost dictionary, pinyin, publication row) of one database without
// running the full data-organize task. The target database comes from
// DESKTOP_LOCAL_DATABASE_URL, falling back to DATABASE_URL.

/** Installed state of the four Magic search tables in the target database. */
type SearchTableState = {
  cards:         string | null;
  parts:         string | null;
  localizations: string | null;
  costs:         string | null;
};

/** Active row counts of the four Magic search tables after a rebuild. */
type SearchTableCounts = {
  cards:         number;
  parts:         number;
  localizations: number;
  costs:         number;
};

/** Rebuilds the Magic PostgreSQL search projection from completed fact rows. */
async function main(): Promise<void> {
  const connection = process.env.DESKTOP_LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;

  if (connection == null) {
    throw new Error('Configure DESKTOP_LOCAL_DATABASE_URL or DATABASE_URL before rebuilding Magic search data.');
  }

  const database = createDb(connection);

  try {
    const [tables] = await database.execute<SearchTableState>(sql`
      SELECT
        to_regclass('magic.search_cards')::text AS cards,
        to_regclass('magic.search_card_parts')::text AS parts,
        to_regclass('magic.search_card_part_localizations')::text AS localizations,
        to_regclass('magic.search_costs')::text AS costs`);

    // Refuse to touch a database whose search schema is incomplete: the rebuild
    // writes every table in one transaction and must not partially apply.
    if (tables?.cards == null || tables.parts == null || tables.localizations == null || tables.costs == null) {
      throw new Error('Magic search tables are not installed; no database changes were made.');
    }

    const startedAt = performance.now();

    await rebuildMagicSearchData(database);

    const [counts] = await database.execute<SearchTableCounts>(sql`
      SELECT
        (SELECT count(*)::int FROM magic.search_cards WHERE deleted_at IS NULL) AS cards,
        (SELECT count(*)::int FROM magic.search_card_parts WHERE deleted_at IS NULL) AS parts,
        (SELECT count(*)::int FROM magic.search_card_part_localizations WHERE deleted_at IS NULL) AS localizations,
        (SELECT count(*)::int FROM magic.search_costs WHERE deleted_at IS NULL) AS costs`);

    console.log(JSON.stringify({
      ...counts,
      durationMs: Math.round(performance.now() - startedAt),
    }));
  } finally {
    await database.$client.end();
  }
}

await main();
