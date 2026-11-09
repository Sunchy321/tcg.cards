import { sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import { createDb } from '@tcg-cards/db';

import { hasHearthstoneSearchTables, rebuildHearthstoneSearchData } from '../src/lib/hearthstone/search-data';

/** Builds the latest search projection and writes its matching sidecar for local validation. */
async function main(): Promise<void> {
  const connection = process.env.DESKTOP_LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
  const output = process.argv[2];
  if (connection == null || output == null) {
    throw new Error('Configure the local database and pass the output manifest path.');
  }
  const database = createDb(connection);
  try {
    const fixtureSchema = process.argv[3];
    if (fixtureSchema != null) {
      const [existing] = await database.execute<{ cards: string | null, localizations: string | null }>(sql`
        SELECT to_regclass('hearthstone.search_cards')::text AS cards,
          to_regclass('hearthstone.search_card_localizations')::text AS localizations`);
      if (existing?.cards != null || existing?.localizations != null) {
        throw new Error('Refusing fixture setup because a search table already exists.');
      }
      // Export fixture DDL from the Drizzle schema; never treat it as a migration.
      // The benchmark operator removes only these newly created fixture tables.
      await database.execute(sql.raw(await Bun.file(fixtureSchema).text()));
    }
    if (!await hasHearthstoneSearchTables(database)) {
      throw new Error('Hearthstone search tables are not installed; no database changes were made.');
    }
    const startedAt = performance.now();
    const manifest = await rebuildHearthstoneSearchData(database);
    const artifact = { ...manifest, buildDurationMs: performance.now() - startedAt };
    await Bun.write(resolve(output), JSON.stringify(artifact, null, 2));
    console.log(JSON.stringify(artifact));
  } finally {
    await database.$client.end();
  }
}

await main();
