import { sql } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { rebuildMagicSearchData } from '../src/lib/magic/project/search-data';

/** Rebuilds the Magic PostgreSQL search projection from completed fact rows. */
async function main(): Promise<void> {
  const connection = process.env.DESKTOP_LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (connection == null) {
    throw new Error('Configure DESKTOP_LOCAL_DATABASE_URL or DATABASE_URL before rebuilding Magic search data.');
  }

  const database = createDb(connection);
  try {
    const [tables] = await database.execute<{
      cards:         string | null;
      parts:         string | null;
      localizations: string | null;
    }>(sql`
      SELECT
        to_regclass('magic.search_cards')::text AS cards,
        to_regclass('magic.search_card_parts')::text AS parts,
        to_regclass('magic.search_card_part_localizations')::text AS localizations`);

    if (tables?.cards == null || tables.parts == null || tables.localizations == null) {
      throw new Error('Magic search tables are not installed; no database changes were made.');
    }

    const startedAt = performance.now();
    await rebuildMagicSearchData(database);
    const [counts] = await database.execute<{
      cards:         number;
      parts:         number;
      localizations: number;
    }>(sql`
      SELECT
        (SELECT count(*)::int FROM magic.search_cards WHERE deleted_at IS NULL) AS cards,
        (SELECT count(*)::int FROM magic.search_card_parts WHERE deleted_at IS NULL) AS parts,
        (SELECT count(*)::int FROM magic.search_card_part_localizations WHERE deleted_at IS NULL) AS localizations`);

    console.log(JSON.stringify({
      ...counts,
      durationMs: performance.now() - startedAt,
    }));
  } finally {
    await database.$client.end();
  }
}

await main();
