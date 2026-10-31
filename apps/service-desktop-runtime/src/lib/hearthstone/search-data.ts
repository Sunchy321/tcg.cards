import { randomUUID } from 'node:crypto';
import { getColumns, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { BaseCard } from '@tcg-cards/db/schema/shared/hearthstone/card';
import { BaseEntity, BaseEntityLocalization } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { Patch } from '@tcg-cards/db/schema/shared/hearthstone/patch';
import { SearchCard, SearchCardLocalization } from '@tcg-cards/db/schema/shared/hearthstone/search';
import { SIMPLE_TAG_IDS } from '@tcg-cards/model/hearthstone/search/manifest';
import type { HearthstoneSearchManifest } from '@tcg-cards/model/hearthstone/search/manifest';

/** Accepts the existing desktop database without a remote build dependency. */
type SearchDb = ReturnType<typeof createDb>;

/** Reports whether migrations have made both search tables available. */
export async function hasHearthstoneSearchTables(database: SearchDb): Promise<boolean> {
  const [row] = await database.execute<{ ready: boolean }>(sql`
    SELECT to_regclass('hearthstone.search_cards') IS NOT NULL
      AND to_regclass('hearthstone.search_card_localizations') IS NOT NULL AS ready`);
  return row?.ready === true;
}

/** Rebuilds both latest-only layers atomically and returns their manifest after commit. */
export async function rebuildHearthstoneSearchData(
  database: SearchDb,
  dataVersion = randomUUID(),
): Promise<HearthstoneSearchManifest> {
  return database.transaction(async tx => {
    // Serialize full rebuilds; publishing and sidecar activation remain ticket 13's responsibility.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hearthstone.search-data'))`);
    const [build] = await tx.select({ buildNumber: sql<number>`max(${Patch.buildNumber})` }).from(Patch);
    if (build?.buildNumber == null) {
      throw new Error('Cannot build Hearthstone search data without a latest patch.');
    }
    const buildNumber = build.buildNumber;
    const { createdAt: _createdAt, updatedAt: _updatedAt, deletedAt: _deletedAt, ...columns } = getColumns(SearchCard);
    const names = Object.values(columns).map(column => sql.identifier(column.name));
    const values = Object.keys(columns).map(key => {
      if (key === 'ambit' || key === 'legalities') {
        return sql`${BaseCard[key]}`;
      }
      if (key === 'simpleTags') {
        return sql`COALESCE((SELECT jsonb_object_agg(key, value)
          FROM jsonb_each(${BaseEntity.mechanics})
          WHERE key IN (${sql.join(SIMPLE_TAG_IDS.map(id => sql`${id}`), sql`, `)})), '{}'::jsonb)`;
      }
      return sql`${getColumns(BaseEntity)[key as keyof typeof BaseEntity.$inferSelect]}`;
    });
    const updates = names.map(name => sql`${name} = excluded.${name}`);

    // Readers see the previous complete snapshot until both upserts commit together.
    await tx.update(SearchCard).set({ deletedAt: new Date(), updatedAt: new Date() });
    await tx.update(SearchCardLocalization).set({ deletedAt: new Date(), updatedAt: new Date() });
    await tx.execute(sql`
      INSERT INTO ${SearchCard} (${sql.join(names, sql`, `)}, updated_at, deleted_at)
      SELECT ${sql.join(values, sql`, `)}, NOW(), NULL
      FROM ${BaseEntity} JOIN ${BaseCard} ON ${BaseCard.cardId} = ${BaseEntity.cardId}
      WHERE ${BaseEntity.deletedAt} IS NULL
        AND ${BaseEntity.version} @> ARRAY[${buildNumber}]::int[]
      ON CONFLICT (card_id) DO UPDATE SET
        ${sql.join(updates, sql`, `)}, updated_at = NOW(), deleted_at = NULL`);

    const localizationColumns = ['card_id', 'lang', 'name', 'text', 'render_hash'];
    const localizationValues: SQL[] = [
      sql`${BaseEntityLocalization.cardId}`, sql`${BaseEntityLocalization.lang}`,
      sql`${BaseEntityLocalization.name}`, sql`${BaseEntityLocalization.text}`, sql`${BaseEntityLocalization.renderHash}`,
    ];
    await tx.execute(sql`
      INSERT INTO ${SearchCardLocalization} (
        ${sql.join(localizationColumns.map(name => sql.identifier(name)), sql`, `)}, updated_at, deleted_at
      )
      SELECT ${sql.join(localizationValues, sql`, `)}, NOW(), NULL
      FROM ${BaseEntityLocalization}
      JOIN ${BaseEntity} ON ${BaseEntity.cardId} = ${BaseEntityLocalization.cardId}
        AND ${BaseEntity.revisionHash} = ${BaseEntityLocalization.revisionHash}
      WHERE ${BaseEntity.deletedAt} IS NULL AND ${BaseEntityLocalization.deletedAt} IS NULL
        AND ${BaseEntity.version} @> ARRAY[${buildNumber}]::int[]
        AND ${BaseEntityLocalization.version} @> ARRAY[${buildNumber}]::int[]
      ON CONFLICT (card_id, lang) DO UPDATE SET
        name = excluded.name, text = excluded.text, render_hash = excluded.render_hash,
        updated_at = NOW(), deleted_at = NULL`);
    return { dataVersion, buildNumber };
  }, { isolationLevel: 'repeatable read' });
}
