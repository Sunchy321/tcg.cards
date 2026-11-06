import { eq, inArray, sql } from 'drizzle-orm';

import { Entity, EntityLocalization, EntityRelation, Tag } from '@tcg-cards/db/schema/local/hearthstone';

import { setLocalDatabaseUrlOverride } from '../electron/runtime/runtime-config';
import { closeLocalDb, getLocalDb } from '../electron/runtime/lib/hearthstone/hsdata-local-db';
import { hasHearthstoneSearchTables, rebuildHearthstoneSearchData } from '../electron/runtime/lib/hearthstone/search-data';
import { entityKey, localizationKey, relationKey } from '../electron/runtime/lib/hearthstone/task/project/reconcile';
import {
  copyEntitiesIntoTable,
  copyLocalizationsIntoTable,
  copyRelationsIntoTable,
  softDeleteEntities,
  softDeleteLocalizations,
  softDeleteRelations,
} from '../electron/runtime/lib/hearthstone/task/project/write';
import { repairRuneRows, runeTags } from './lib/hearthstone-runes';

/** Repairs retained rune quantities and their hashes without replaying unrelated tag rules. */
async function main(): Promise<void> {
  const connection = process.env.DESKTOP_LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (connection == null) {
    throw new Error('Configure DESKTOP_LOCAL_DATABASE_URL or DATABASE_URL before repairing runes.');
  }

  setLocalDatabaseUrlOverride(connection);
  const database = getLocalDb();

  try {
    await database.transaction(async tx => {
      // Keep the source rows stable until their replacement revisions are committed.
      await tx.execute(sql`LOCK TABLE hearthstone.entities, hearthstone.entity_localizations,
        hearthstone.entity_relations, hearthstone.tags IN SHARE ROW EXCLUSIVE MODE`);
      const affected = await tx.select({ cardId: Entity.cardId }).from(Entity)
        .where(sql`${Entity.mechanics} ?| ARRAY['2196', '2197', '2198']`);
      const cardIds = [...new Set(affected.map(row => row.cardId))];
      const entities = cardIds.length === 0
        ? []
        : await tx.select().from(Entity)
          .where(inArray(Entity.cardId, cardIds));
      const localizations = cardIds.length === 0
        ? []
        : await tx.select().from(EntityLocalization)
          .where(inArray(EntityLocalization.cardId, cardIds));
      const relations = cardIds.length === 0
        ? []
        : await tx.select().from(EntityRelation)
          .where(inArray(EntityRelation.sourceId, cardIds));
      const repaired = repairRuneRows(entities, localizations, relations);
      const entityKeys = new Set(repaired.entities.map(entityKey));
      const localizationKeys = new Set(repaired.localizations.map(localizationKey));
      const relationKeys = new Set(repaired.relations.map(relationKey));

      console.log(JSON.stringify({
        apply:             process.argv.includes('--apply'),
        cards:             cardIds.length,
        affectedRevisions: affected.length,
        entities:          repaired.entities.length,
        localizations:     repaired.localizations.length,
        relations:         repaired.relations.length,
      }));
      if (!process.argv.includes('--apply')) {
        return;
      }

      for (const { enumId, ...config } of runeTags) {
        const updated = await tx.update(Tag).set(config).where(eq(Tag.enumId, enumId)).returning({ enumId: Tag.enumId });
        if (updated.length !== 1) {
          throw new Error(`Missing rune tag ${enumId}.`);
        }
      }

      await softDeleteEntities(tx, entities.filter(row => !entityKeys.has(entityKey(row))));
      await softDeleteLocalizations(tx, localizations.filter(row => !localizationKeys.has(localizationKey(row))));
      await softDeleteRelations(tx, relations.filter(row => !relationKeys.has(relationKey(row))));
      await copyEntitiesIntoTable(tx, repaired.entities);
      await copyLocalizationsIntoTable(tx, repaired.localizations);
      await copyRelationsIntoTable(tx, repaired.relations);
    });

    if (process.argv.includes('--apply')) {
      if (await hasHearthstoneSearchTables(database)) {
        await rebuildHearthstoneSearchData(database);
      }
      const [remaining] = await database.select({ count: sql<number>`count(*)::int` }).from(Entity)
        .where(sql`${Entity.mechanics} ?| ARRAY['2196', '2197', '2198']`);
      if (remaining?.count !== 0) {
        throw new Error(`${remaining?.count} active revisions still contain misplaced rune tags.`);
      }
      console.log('[rune-repair] completed');
    }
  } finally {
    await closeLocalDb();
  }
}

await main();
