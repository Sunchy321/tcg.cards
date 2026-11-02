import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { createDb } from '@tcg-cards/db';
import { SearchPublicationMetadata } from '@tcg-cards/db/schema/remote';
import { SearchCardPart, SearchCost } from '@tcg-cards/db/schema/shared/magic/search';
import { costTokensSql } from '@tcg-cards/db/search-cost';
import { rebuildMagicSearchData } from '../src/lib/magic/project/search-data';

/**
 * Ticket 16/17 smoke: inside one transaction, converts the fact cost column to
 * its braced text form when the local database still holds the array form,
 * installs the cost dictionary table and key column, runs the real projection
 * rebuild on the live local facts, checks the dictionary's structural
 * invariants, measures build time and storage, then rolls everything back so
 * the database keeps its current facts, projection, and publication row.
 */
async function main(): Promise<void> {
  const connection = process.env.DESKTOP_LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
  const outputPath = process.argv[2];
  if (connection == null || outputPath == null) {
    throw new Error('Pass a local database connection and an output evidence path.');
  }

  const database = createDb(connection);
  const rollback = new Error('Roll back the cost dictionary smoke.');
  const evidence: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    rollback:    'the dictionary table, key column, rebuilt rows, and publication row changes are all inside one transaction that is deliberately rolled back',
  };

  try {
    try {
      await database.transaction(async tx => {
        const sizes = async () => {
          const [row] = await tx.execute<Record<string, string>>(sql`
            SELECT
              pg_total_relation_size('magic.search_cards') AS cards,
              pg_total_relation_size('magic.search_card_parts') AS parts,
              pg_total_relation_size('magic.search_card_part_localizations') AS localizations,
              COALESCE(pg_total_relation_size(to_regclass('magic.search_costs')), 0) AS costs`);
          return Object.fromEntries(Object.entries(row!).map(([key, value]) => [key, Number(value)]));
        };
        const [before] = await tx.select().from(SearchPublicationMetadata)
          .where(eq(SearchPublicationMetadata.game, 'magic'));
        evidence.before = {
          sizes:          await sizes(),
          dataVersion:    before?.dataVersion ?? null,
          plannerKeys:    Object.keys((before?.plannerMetadata as object | null) ?? {}),
          costProjection: (before?.plannerMetadata as { costProjection?: unknown } | null)?.costProjection ?? null,
        };

        const [installed] = await tx.execute<{ costs: string | null, key: string | null }>(sql`
          SELECT
            to_regclass('magic.search_costs')::text AS costs,
            (SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'magic' AND table_name = 'search_card_parts' AND column_name = 'cost') AS key`);
        assert.equal(installed?.costs, null, 'search_costs must not exist before the smoke');
        assert.equal(installed?.key, null, 'search_card_parts.cost must not exist before the smoke');

        // Ticket 17 moves the fact column to braced text; until that migration
        // is applied locally, perform the same deterministic conversion here.
        const [costColumn] = await tx.execute<{ data_type: string }>(sql`
          SELECT data_type FROM information_schema.columns
          WHERE table_schema = 'magic' AND table_name = 'card_parts' AND column_name = 'cost'`);
        evidence.factColumnBefore = costColumn?.data_type ?? null;
        if (costColumn?.data_type === 'ARRAY') {
          evidence.recreatedViews = await convertCostColumnToText(tx);
        }

        await tx.execute(sql.raw(createTableSql(SearchCost)));
        await tx.execute(sql`ALTER TABLE ${SearchCardPart} ADD COLUMN cost text`);

        const startedAt = performance.now();
        await rebuildMagicSearchData(tx as unknown as Parameters<typeof rebuildMagicSearchData>[0]);
        const rebuildMs = Math.round(performance.now() - startedAt);

        const [counts] = await tx.execute<Record<string, string>>(sql`
          SELECT
            (SELECT count(*) FROM ${SearchCost} WHERE deleted_at IS NULL) AS dictionary_rows,
            (SELECT count(*) FROM ${SearchCost} WHERE deleted_at IS NOT NULL) AS dictionary_retired,
            (SELECT count(*) FROM ${SearchCardPart} WHERE deleted_at IS NULL) AS parts,
            (SELECT count(*) FROM ${SearchCardPart} WHERE deleted_at IS NULL AND cost IS NOT NULL) AS parts_with_cost,
            (SELECT count(*) FROM ${SearchCardPart} WHERE deleted_at IS NULL AND cost IS NULL) AS parts_without_cost,
            (SELECT count(*) FROM magic.card_parts p JOIN magic.cards c ON c.card_id = p.card_id AND c.version = p.version
              WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND p.cost IS NOT NULL) AS domain_parts_with_cost,
            (SELECT count(DISTINCT p.cost) FROM magic.card_parts p JOIN magic.cards c ON c.card_id = p.card_id AND c.version = p.version
              WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND p.cost IS NOT NULL) AS domain_distinct_costs,
            (SELECT count(*) FROM ${SearchCardPart} s
              WHERE s.deleted_at IS NULL AND s.cost IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM ${SearchCost} d WHERE d.cost = s.cost AND d.deleted_at IS NULL)) AS orphan_keys,
            (SELECT count(*) FROM ${SearchCost} d
              WHERE d.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM ${SearchCardPart} s WHERE s.cost = d.cost AND s.deleted_at IS NULL)) AS unreferenced_rows,
            (SELECT count(*) FROM ${SearchCardPart} s
              JOIN magic.card_parts p ON p.card_id = s.card_id AND p.version = s.version AND p.part_index = s.part_index
              WHERE s.deleted_at IS NULL AND p.deleted_at IS NULL
                AND s.cost IS DISTINCT FROM p.cost) AS key_mismatches,
            (SELECT count(*) FROM ${SearchCost} d
              WHERE d.deleted_at IS NULL AND d.tokens IS DISTINCT FROM ${costTokensSql(sql`d.cost`)}) AS token_mismatches,
            (SELECT count(*) FROM ${SearchCost} d
              WHERE d.deleted_at IS NULL
                AND d.generic IS DISTINCT FROM COALESCE((SELECT SUM(t::int) FROM unnest(d.tokens) t WHERE t ~ '^[0-9]+$'), 0)) AS generic_mismatches,
            (SELECT count(*) FROM ${SearchCost} d
              WHERE d.deleted_at IS NULL
                AND d.w + d.u + d.b + d.r + d.g + d.c + d.x + cardinality(d.specials)
                  IS DISTINCT FROM (SELECT count(*) FROM unnest(d.tokens) t WHERE t !~ '^[0-9]+$')) AS symbol_count_mismatches`);
        const numbers = Object.fromEntries(Object.entries(counts!).map(([key, value]) => [key, Number(value)]));

        assert.equal(numbers.parts_with_cost, numbers.domain_parts_with_cost, 'every active part with a cost carries a key');
        assert.equal(numbers.dictionary_rows, numbers.domain_distinct_costs, 'one dictionary row per distinct stored cost');
        assert.equal(numbers.orphan_keys, 0, 'every key resolves to an active dictionary row');
        assert.equal(numbers.unreferenced_rows, 0, 'every active dictionary row is referenced');
        assert.equal(numbers.key_mismatches, 0, 'every key is the stored fact text');
        assert.equal(numbers.token_mismatches, 0, 'every dictionary token array is the tokenization of its key');
        assert.equal(numbers.generic_mismatches, 0, 'generic sums every numeric token');
        assert.equal(numbers.symbol_count_mismatches, 0, 'fixed counts plus specials cover every non-numeric token');

        const specialKinds = await tx.execute<{ kinds: number, rows: string }>(sql`
          SELECT (SELECT count(DISTINCT s) FROM unnest(d.specials) s)::int AS kinds, count(*) AS rows
          FROM ${SearchCost} d WHERE d.deleted_at IS NULL
          GROUP BY 1 ORDER BY 1`);
        const samples = await tx.execute<Record<string, unknown>>(sql`
          SELECT cost, generic, w, u, b, r, g, c, x, specials
          FROM ${SearchCost}
          WHERE deleted_at IS NULL AND cost IN ('{2}{C}{C}{C}{2}', '{X}{Y}{Z}{R}{R}', '{HW}', '{2}{R}{D}', '{1}{B/G}{B/G}{B/G}', '{W}{U}')
          ORDER BY cost`);

        const [after] = await tx.select().from(SearchPublicationMetadata)
          .where(eq(SearchPublicationMetadata.game, 'magic'));
        const planner = after?.plannerMetadata as { costProjection?: unknown, typeSymbols?: unknown[] } | null;
        assert.equal(planner?.costProjection, true, 'the rebuilt publication flags the cost projection');
        assert.notEqual(after?.dataVersion, before?.dataVersion, 'the fingerprint changes once the dictionary joins the projection');

        evidence.rebuildMs = rebuildMs;
        evidence.counts = numbers;
        evidence.specialKinds = specialKinds.map(row => ({ kinds: row.kinds, rows: Number(row.rows) }));
        evidence.samples = samples;
        evidence.after = {
          sizes:          await sizes(),
          dataVersion:    after?.dataVersion ?? null,
          costProjection: planner?.costProjection ?? null,
          typeSymbols:    planner?.typeSymbols?.length ?? null,
        };
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }

    const [installed] = await database.execute<{ costs: string | null, key: string | null }>(sql`
      SELECT
        to_regclass('magic.search_costs')::text AS costs,
        (SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'magic' AND table_name = 'search_card_parts' AND column_name = 'cost') AS key`);
    const [publication] = await database.select().from(SearchPublicationMetadata)
      .where(eq(SearchPublicationMetadata.game, 'magic'));
    const [factColumn] = await database.execute<{ data_type: string }>(sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'magic' AND table_name = 'card_parts' AND column_name = 'cost'`);
    evidence.afterRollback = {
      costsTable:  installed?.costs ?? null,
      keyColumn:   installed?.key ?? null,
      factColumn:  factColumn?.data_type ?? null,
      dataVersion: publication?.dataVersion ?? null,
    };
    assert.equal(installed?.costs, null, 'rollback removed the dictionary table');
    assert.equal(installed?.key, null, 'rollback removed the key column');
    assert.equal(factColumn?.data_type, evidence.factColumnBefore, 'rollback restored the fact column type');
    assert.equal(publication?.dataVersion, (evidence.before as { dataVersion: string | null }).dataVersion, 'rollback restored the publication row');

    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ rebuildMs: evidence.rebuildMs, counts: evidence.counts, output: outputPath }));
  } finally {
    await database.$client.end();
  }
}

/**
 * Converts the fact cost column to its braced text form inside the current
 * transaction. PostgreSQL refuses to retype a column a view selects, so the
 * dependent views are dropped around the conversion and recreated from their
 * saved definitions — the same sequence the real migration has to follow.
 */
async function convertCostColumnToText(tx: { execute: (query: SQL) => Promise<unknown> }): Promise<string[]> {
  const views = await tx.execute(sql`
    SELECT DISTINCT n.nspname AS schema, c.relname AS name, pg_get_viewdef(c.oid, true) AS definition
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class c ON c.oid = r.ev_class
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE d.refobjid = 'magic.card_parts'::regclass AND a.attname = 'cost' AND c.relkind = 'v' AND c.oid <> d.refobjid
    ORDER BY name`) as Array<{ schema: string, name: string, definition: string }>;

  for (const view of views) {
    await tx.execute(sql`DROP VIEW ${sql.identifier(view.schema)}.${sql.identifier(view.name)}`);
  }
  await tx.execute(sql`
    ALTER TABLE magic.card_parts
    ALTER COLUMN cost TYPE text
    USING CASE WHEN cost IS NULL THEN NULL ELSE '{' || array_to_string(cost, '}{') || '}' END`);
  for (const view of views) {
    await tx.execute(sql`CREATE VIEW ${sql.identifier(view.schema)}.${sql.identifier(view.name)} AS ${sql.raw(view.definition)}`);
  }

  return views.map(view => `${view.schema}.${view.name}`);
}

/** `CREATE TABLE` for one Drizzle table, mirroring the shape drizzle-kit would generate. */
function createTableSql(table: typeof SearchCost): string {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const config = getTableConfig(table);
  const columns = config.columns.map(column => {
    const dimensions = Number((column as { config?: { dimensions?: number } }).config?.dimensions ?? 0);
    const type = `${column.getSQLType()}${'[]'.repeat(dimensions)}`;
    const defaultValue = column.name === 'created_at' || column.name === 'updated_at' ? ' DEFAULT now()' : '';
    return `${quote(column.name)} ${type}${column.notNull ? ' NOT NULL' : ''}${defaultValue}`;
  });
  const primaryKeys = config.primaryKeys.flatMap(key => key.columns.map(column => quote(column.name)));
  return `CREATE TABLE ${quote(config.schema ?? 'magic')}.${quote(config.name)} (${[...columns, `PRIMARY KEY (${primaryKeys.join(', ')})`].join(', ')})`;
}

await main();
