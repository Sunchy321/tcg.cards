import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, eq, getColumns, inArray, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { BaseCard } from '@tcg-cards/db/schema/shared/hearthstone/card';
import { BaseEntity, BaseEntityLocalization, LatestCardEntityView } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { SearchCard, SearchCardLocalization } from '@tcg-cards/db/schema/shared/hearthstone/search';
import { rebuildHearthstoneSearchData } from '../src/lib/hearthstone/search-data';

/** Verifies version membership and localization refresh with only rollback-scoped fixture facts. */
async function main(): Promise<void> {
  const connection = process.env.DESKTOP_LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (connection == null || process.argv[2] == null) {
    throw new Error('Pass a local database connection and output evidence path.');
  }
  const database = createDb(connection);
  const prefix = `__search_fixture_${randomUUID()}`;
  const ids = [`${prefix}_old`, `${prefix}_current`, `${prefix}_partial`];
  const rollback = new Error('Rollback the isolated regression fixtures.');
  const evidence: Record<string, unknown> = {};
  try {
    try {
      await database.transaction(async tx => {
        const [latest] = await tx.execute<{ build: number }>(sql`SELECT max(build_number) AS build FROM hearthstone.patches`);
        const build = latest!.build;
        await tx.insert(BaseCard).values(ids.map(cardId => ({ cardId, ambit: 'primary' as const, legalities: {} })));

        /** Copies a real source shape into a unique test identity within this transaction. */
        const clone = async (table: typeof BaseEntity | typeof BaseEntityLocalization, overrides: Record<string, SQL>, predicate: SQL) => {
          const columns = getColumns(table);
          await tx.execute(sql`INSERT INTO ${table} (${sql.join(Object.values(columns).map(column => sql.identifier(column.name)), sql`, `)})
            SELECT ${sql.join(Object.entries(columns).map(([key, column]) => overrides[key] ?? sql`${column}`), sql`, `)}
            FROM ${table} WHERE ${predicate} LIMIT 1`);
        };
        for (const [index, cardId] of ids.entries()) {
          await clone(BaseEntity, {
            cardId:       sql`${cardId}`,
            revisionHash: sql`'fixture-revision'`,
            version:      index === 0 ? sql`ARRAY[${build - 1}]::int[]` : sql`ARRAY[${build - 1}, ${build}]::int[]`,
            mechanics:    sql`'${sql.raw('{"12":false,"1665":3,"4503":1,"999":true}')}'::jsonb`,
          }, sql`${BaseEntity.deletedAt} IS NULL AND ${BaseEntity.version} @> ARRAY[${build}]::int[]`);
          for (const [lang, current] of [['en', false], ['en', true], ['zhs', true]] as const) {
            if (index !== 1 && (current || lang !== 'en')) {
              continue;
            }
            await clone(BaseEntityLocalization, {
              cardId:           sql`${cardId}`,
              revisionHash:     sql`'fixture-revision'`,
              localizationHash: sql`${`fixture-${lang}-${current}`}`,
              lang:             sql`${lang}::hearthstone.locale`,
              version:          current ? sql`ARRAY[${build}]::int[]` : sql`ARRAY[${build - 1}]::int[]`,
              name:             sql`${`Fixture ${lang} ${current}`}`,
            }, sql`${BaseEntityLocalization.deletedAt} IS NULL AND ${BaseEntityLocalization.lang} = 'en'
              AND ${BaseEntityLocalization.version} @> ARRAY[${build}]::int[]`);
          }
        }
        await rebuildHearthstoneSearchData(tx as unknown as Parameters<typeof rebuildHearthstoneSearchData>[0]);

        /** Compares the exact latest identities and text with the original domain view. */
        const compare = async () => {
          const projected = await tx.select({
            cardId:     SearchCard.cardId,
            lang:       SearchCardLocalization.lang,
            name:       SearchCardLocalization.name,
            text:       SearchCardLocalization.text,
            renderHash: SearchCardLocalization.renderHash,
          }).from(SearchCard).innerJoin(SearchCardLocalization, eq(SearchCard.cardId, SearchCardLocalization.cardId))
            .where(and(inArray(SearchCard.cardId, ids), isNull(SearchCard.deletedAt), isNull(SearchCardLocalization.deletedAt)))
            .orderBy(SearchCard.cardId, SearchCardLocalization.lang);
          const domain = await tx.select({
            cardId:     LatestCardEntityView.cardId,
            lang:       LatestCardEntityView.lang,
            name:       LatestCardEntityView.localization.name,
            text:       LatestCardEntityView.localization.text,
            renderHash: LatestCardEntityView.renderHash,
          }).from(LatestCardEntityView).where(inArray(LatestCardEntityView.cardId, ids))
            .orderBy(LatestCardEntityView.cardId, LatestCardEntityView.lang);
          assert.deepEqual(projected, domain);
          assert.equal(projected.length, 2);
          assert.ok(projected.every(row => row.cardId === ids[1]));
          return projected;
        };
        evidence.membership = await compare();
        const [tags] = await tx.select({ tags: SearchCard.simpleTags }).from(SearchCard).where(eq(SearchCard.cardId, ids[1]!));
        assert.deepEqual(tags!.tags, { 12: false, 1665: 3, 4503: 1 });
        evidence.tags = tags!.tags;

        // Reuse the same entity revision and change only its current localization.
        await tx.update(BaseEntityLocalization).set({ name: 'Changed translation', text: 'Changed plain text', renderHash: 'fixture-render' })
          .where(and(eq(BaseEntityLocalization.cardId, ids[1]!), eq(BaseEntityLocalization.localizationHash, 'fixture-en-true')));
        const [orphanSource] = await tx.select().from(SearchCard).where(eq(SearchCard.cardId, ids[1]!));
        await tx.insert(SearchCard).values({ ...orphanSource!, cardId: `${prefix}_orphan` });
        await rebuildHearthstoneSearchData(tx as unknown as Parameters<typeof rebuildHearthstoneSearchData>[0]);
        evidence.localizationRefresh = await compare();
        const [orphan] = await tx.select().from(SearchCard).where(eq(SearchCard.cardId, `${prefix}_orphan`));
        assert.ok(orphan!.deletedAt instanceof Date);
        evidence.orphanSoftDeleted = true;
        throw rollback;
      }, { isolationLevel: 'repeatable read' });
    } catch (error) {
      if (error !== rollback) {
        throw error;
      }
    }
    const [remaining] = await database.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM ${BaseCard} WHERE ${BaseCard.cardId} LIKE ${`${prefix}%`}`);
    assert.equal(remaining!.count, 0);
    evidence.fixtureFactsRemaining = remaining!.count;
    await Bun.write(process.argv[2], JSON.stringify(evidence, null, 2));
    console.log('Latest membership, localization refresh, simple tags, and orphan soft deletion passed; all fixture facts rolled back.');
  } finally {
    await database.$client.end();
  }
}

await main();
