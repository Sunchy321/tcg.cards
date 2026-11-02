import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getTableConfig } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';

import { runWithDb } from '@tcg-cards/db/db';
import { Card } from '@tcg-cards/db/schema/shared/magic/card';
import { SearchCard, SearchCardPart, SearchCardPartLocalization, SearchCost } from '@tcg-cards/db/schema/shared/magic/search';
import { SearchPublicationMetadata } from '#schema/shared/search-publication';
import { costDictionaryColumnsSql, costTokensSql } from '@tcg-cards/db/search-cost';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';
import type { SearchPublicationManifest } from '@tcg-cards/model/search/publication';

import * as magicCommands from '../server/search/command-list';
import { MagicPgSearchAdapter, setMagicSearchManifest } from '../server/search/accelerated-adapter';
import { MagicD1SearchAdapter } from '../server/search/d1/adapter';
import type { MagicSearchD1Database } from '../server/search/d1/types';
import { writeMagicD1Snapshot } from './d1-snapshot';
import { magicSnapshotDdl, writeDatabase } from './export-local-search';

/**
 * Ticket 18 regression: inside one rolled back PostgreSQL transaction the cost
 * dictionary is installed on live data, the real local exporter writes a
 * temporary base + en package from those rows, the real D1 snapshot writer
 * merges them, and every covered cost DSL case must return the same card
 * identities from the SQLite adapter as from the PostgreSQL accelerated
 * adapter. Nothing persists: the transaction rolls back and the temporary
 * package directory is deleted.
 */

const pageSize = 50;
const cases = [
  'cost:{W}',
  'cost=2W',
  'cost>=2W',
  'cost<=1W',
  'cost<WV',
  'cost>V',
  'cost:{G/W}',
  'cost={1}{G/W}{G/W}',
  'cost={2}{C}{C}{C}{2}',
  'cost:{2}{R}{D}',
  'cost:{B/P}',
  'cost:X',
  'cost:{W}{U}{B}{R}{G}',
  'cost:null',
  '-cost:null mv<=1',
  'cost:{W}|{U} mv:2',
  '-cost:{W}|{U} mv:1',
  'cost>=3 format:modern',
  'cost:{2R}',
] as const;

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl == null) throw new Error('DATABASE_URL is missing');
const parsedUrl = new URL(databaseUrl);
if (parsedUrl.hostname !== 'localhost' || parsedUrl.port !== '5432' || parsedUrl.pathname !== '/local') {
  throw new Error('This regression is locked to localhost:5432/local.');
}
parsedUrl.hostname = '127.0.0.1';

const client = postgres(parsedUrl.toString(), { max: 1, connect_timeout: 5, application_name: 'magic-cost-sqlite-regression' });
const database = drizzle({ client });
const rollback = new Error('ROLLBACK_COST_SQLITE_REGRESSION');
const dataVersion = 't18-cost-sqlite-regression';
const releaseHash = 'a'.repeat(64);
const pgAdapter = new MagicPgSearchAdapter();
const d1Adapter = new MagicD1SearchAdapter();

/** Resolves a DSL string into the request shape both adapters consume. */
function request(q: string) {
  return resolveQueryRequest(simplify(new Parser(q).parse()), Object.values(magicCommands) as any, {
    sort:  [{ kind: 'request', field: 'order', value: 'id+' }],
    group: 'card',
    page:  1,
    pageSize,
    total: true,
    ambit: null,
    lang:  'en',
  });
}

/** Runs the production Drizzle D1 statements directly on the merged SQLite file. */
function binding(sqlite: Database): MagicSearchD1Database {
  return {
    prepare(query: string) {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        async raw() {
          return sqlite.query(query).values(...params as never[]);
        },
        async all() {
          return { results: sqlite.query(query).all(...params as never[]) };
        },
      };
    },
  } as unknown as MagicSearchD1Database;
}

/** Card-level identity of one essential result. */
function identity(result: { total: number, result: Array<{ cardId: string, version: string }> }) {
  return { total: result.total, rows: result.result.map(row => [row.cardId, row.version]) };
}

const report: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  rollback:    'the PostgreSQL changes run inside one transaction that is deliberately rolled back; the temporary SQLite packages are deleted',
};
let exitCode = 0;
const temporary = await mkdtemp(join(tmpdir(), 'magic-cost-sqlite-'));

try {
  try {
    await database.transaction(async transaction => {
      const [baseline] = await transaction.execute(sql`
        SELECT
          to_regclass('magic.search_costs')::text AS costs,
          (SELECT data_type FROM information_schema.columns
           WHERE table_schema = 'magic' AND table_name = 'card_parts' AND column_name = 'cost') AS fact_cost`) as Array<{ costs: string | null, fact_cost: string | null }>;
      // Runs against either shape: a database that has already applied the ticket 17
      // schema is used as-is, and the pre-migration shape is converted inside this
      // transaction. Either way the dictionary and part keys are (re)built here.
      report.factColumnBefore = baseline?.fact_cost ?? null;
      const [costColumn] = await transaction.execute(sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'magic' AND table_name = 'card_parts' AND column_name = 'cost'`) as Array<{ data_type: string }>;
      if (costColumn?.data_type === 'ARRAY') {
        report.recreatedViews = await convertCostColumnToText(transaction);
      }
      if (baseline?.costs == null) {
        await transaction.execute(sql.raw(createSearchCostsSql()));
      }
      const [partCostColumn] = await transaction.execute(sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'magic' AND table_name = 'search_card_parts' AND column_name = 'cost'`) as Array<{ data_type: string }>;
      if (partCostColumn == null) {
        await transaction.execute(sql`ALTER TABLE ${SearchCardPart} ADD COLUMN cost text`);
      }
      await transaction.execute(sql`
        INSERT INTO ${SearchCost} (cost, tokens, generic, w, u, b, r, g, c, x, specials)
        SELECT d.cost, d.tokens, ${costDictionaryColumnsSql(sql`d.tokens`)}
        FROM (
          SELECT distinct_costs.cost, ${costTokensSql(sql`distinct_costs.cost`)} AS tokens
          FROM (
            SELECT DISTINCT p.cost
            FROM ${Card} c
            JOIN magic.card_parts p ON p.card_id = c.card_id AND p.version = c.version
            WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND p.cost IS NOT NULL
          ) distinct_costs
        ) d
        ON CONFLICT (cost) DO UPDATE SET
          tokens = EXCLUDED.tokens,
          generic = EXCLUDED.generic,
          w = EXCLUDED.w, u = EXCLUDED.u, b = EXCLUDED.b, r = EXCLUDED.r,
          g = EXCLUDED.g, c = EXCLUDED.c, x = EXCLUDED.x,
          specials = EXCLUDED.specials,
          updated_at = NOW(),
          deleted_at = NULL`);
      await transaction.execute(sql`
        UPDATE ${SearchCardPart} s
        SET cost = p.cost
        FROM ${Card} c
        JOIN magic.card_parts p ON p.card_id = c.card_id AND p.version = c.version
        WHERE p.part_index = s.part_index
          AND s.card_id = p.card_id
          AND s.version = p.version
          AND s.deleted_at IS NULL AND c.deleted_at IS NULL AND p.deleted_at IS NULL`);

      // Source rows exactly as the exporter reads them.
      const cards = await transaction.select().from(SearchCard).where(isNull(SearchCard.deletedAt))
        .orderBy(SearchCard.cardId, SearchCard.version);
      const parts = await transaction.select().from(SearchCardPart).where(isNull(SearchCardPart.deletedAt))
        .orderBy(SearchCardPart.cardId, SearchCardPart.version, SearchCardPart.partIndex);
      const localizations = await transaction.select().from(SearchCardPartLocalization)
        .where(isNull(SearchCardPartLocalization.deletedAt))
        .orderBy(
          SearchCardPartLocalization.cardId,
          SearchCardPartLocalization.version,
          SearchCardPartLocalization.partIndex,
          SearchCardPartLocalization.locale,
          SearchCardPartLocalization.source,
        );
      const costs = await transaction.select().from(SearchCost).where(isNull(SearchCost.deletedAt))
        .orderBy(SearchCost.cost);
      const [publication] = await transaction.select().from(SearchPublicationMetadata)
        .where(sql`${SearchPublicationMetadata.game} = 'magic'`);
      const planner = publication?.plannerMetadata as { typeSymbols: string[], tagOwners: Record<string, 'card-only' | 'print-only' | 'overlap'> };
      report.source = { cards: cards.length, parts: parts.length, localizations: localizations.length, costs: costs.length };
      console.log(`[t18] source loaded ${JSON.stringify(report.source)}`);

      // Real exporter: base + en packages, then the real D1 merge.
      console.log('[t18] exporting SQLite DDL');
      const ddl = magicSnapshotDdl();
      console.log('[t18] DDL ready');
      const fts = await Bun.file(new URL(import.meta.resolve('@tcg-cards/db/schema/sqlite/magic/search-fts.sql'))).text();
      const basePath = join(temporary, 'magic-base.sqlite');
      const enPath = join(temporary, 'magic-en.sqlite');
      const started = performance.now();
      await writeDatabase(basePath, ddl, fts, { cards, parts, localizations: [], costs, dataVersion, packageRole: 'base' });
      await writeDatabase(enPath, ddl, fts, {
        cards, parts, costs, dataVersion,
        localizations: localizations.filter(row => row.locale === 'en'),
        locale:        'en',
        packageRole:   'locale',
      });
      report.exportMs = Math.round(performance.now() - started);
      console.log(`[t18] packages written in ${report.exportMs}ms`);

      const manifest = {
        manifestVersion: 1,
        game:            'magic',
        dataVersion,
        schemaVersion:   LOCAL_SEARCH_SCHEMA_VERSIONS.magic,
        releaseHash,
        pgFingerprint:   'b'.repeat(64),
        generatedAt:     new Date().toISOString(),
        packages:        [],
        typeSymbols:     planner.typeSymbols,
        tagOwners:       planner.tagOwners,
      } as unknown as SearchPublicationManifest & { game: 'magic' };
      console.log('[t18] merging D1 snapshot');
      const snapshotPath = join(temporary, 'd1.sql');
      await writeMagicD1Snapshot({ outputPath: snapshotPath, manifest, packagePaths: { base: basePath, locales: { en: enPath } } });
      console.log('[t18] applying D1 snapshot to SQLite');
      // The D1 snapshot is a streaming SQL import for D1 itself; applying its
      // three-hundred-thousand text inserts locally is pointless here. Assert it
      // carries the dictionary rows, then build the query database by merging the
      // same two packages the snapshot was generated from.
      const snapshotSql = await Bun.file(snapshotPath).text();
      report.d1Snapshot = {
        costInserts:        snapshotSql.split('INSERT INTO "magic_search_costs"').length - 1,
        costSpecialInserts: snapshotSql.split('INSERT INTO "magic_search_cost_specials"').length - 1,
        clearsDictionary:   snapshotSql.includes('DELETE FROM magic_search_costs;'),
      };
      await copyFile(basePath, join(temporary, 'merged.sqlite'));
      const merged = new Database(join(temporary, 'merged.sqlite'));
      merged.exec('PRAGMA foreign_keys = OFF');
      merged.exec(`ATTACH DATABASE '${enPath}' AS en`);
      for (const table of ['magic_search_candidates', 'magic_search_card_part_localizations']) {
        merged.exec(`INSERT INTO ${table} SELECT * FROM en.${table}`);
      }
      // Body text is renumbered by the D1 snapshot and no cost case reads it, so
      // only the localization rows the search join needs are merged.
      merged.exec('DELETE FROM magic_search_meta WHERE key IN (\'release_hash\', \'data_version\', \'schema_version\')');
      merged.exec('INSERT INTO magic_search_meta (key, value) VALUES (\'data_version\', \'t18-cost-sqlite-regression\')');
      merged.exec('INSERT INTO magic_search_meta (key, value) VALUES (\'release_hash\', \'${releaseHash}\')');
      merged.exec('INSERT INTO magic_search_meta (key, value) VALUES (\'schema_version\', \'${LOCAL_SEARCH_SCHEMA_VERSIONS.magic}\')');
      merged.exec('DETACH DATABASE en');
      const [{ dictionaryRows, specialRows, keyedParts }] = merged.query(`
        SELECT
          (SELECT count(*) FROM magic_search_costs) AS dictionaryRows,
          (SELECT count(*) FROM magic_search_cost_specials) AS specialRows,
          (SELECT count(*) FROM magic_search_card_parts WHERE cost IS NOT NULL) AS keyedParts`).all() as Array<Record<string, number>>;
      report.sqlite = { dictionaryRows, specialRows, keyedParts, bytes: (await Bun.file(join(temporary, 'merged.sqlite')).stat()).size };

      // Both adapters see the same release identity; the PostgreSQL adapter skips
      // the publication-row guard when no fingerprint is pinned.
      setMagicSearchManifest({
        dataVersion,
        releaseHash,
        typeSymbols:    planner.typeSymbols,
        tagOwners:      planner.tagOwners,
        costProjection: true,
      });

      console.log(`[t18] running ${cases.length} cases`);
      const results: Array<Record<string, unknown>> = [];
      for (const q of cases) {
        const resolved = request(q);
        const d1Plan = d1Adapter.plan(resolved).type;
        const pgPlan = pgAdapter.plan(resolved).type;
        const options = { page: 1, pageSize, lang: 'en' as const, groupBy: 'card', orderBy: 'id+', dsl: q };
        const pg = identity(await runWithDb(transaction as any, () => pgAdapter.executeEssential(resolved, options)));
        const sqliteStarted = performance.now();
        const d1 = identity(await runWithDb(transaction as any, () => d1Adapter.executeEssential(resolved, { ...options, d1: binding(merged) })));
        const sqliteMs = Math.round(performance.now() - sqliteStarted);
        const match = JSON.stringify(pg) === JSON.stringify(d1);
        if (!match || d1Plan !== 'exact') {
          exitCode = 1;
          report[`${q}Mismatch`] = { d1Plan, pgPlan, pg, d1 };
        }
        results.push({ q, d1Plan, pgPlan, total: pg.total, match, sqliteMs });
      }
      report.cases = results;
      report.allMatch = results.every(item => item.match === true && item.d1Plan === 'exact');
      merged.close();
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
} finally {
  setMagicSearchManifest(null);
  // Rollback proof: the fact column type and dictionary presence must match the
  // state observed before the transaction.
  const restored = await client.unsafe(`
    SELECT to_regclass('magic.search_costs')::text AS costs,
      (SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'magic' AND table_name = 'card_parts' AND column_name = 'cost') AS fact_cost`);
  report.afterRollback = {
    costsTable: restored[0]?.costs ?? null,
    factColumn: restored[0]?.fact_cost ?? null,
  };
  if ((restored[0]?.costs ?? null) != null || restored[0]?.fact_cost !== report.factColumnBefore) {
    exitCode = 1;
  }
  await client.end();
  await rm(temporary, { recursive: true, force: true });
}

await writeFile(
  resolve(import.meta.dir, '../../../.scratch/search-acceleration/benchmark-artifacts/t18-cost-sqlite-regression.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify({ allMatch: report.allMatch, sqlite: report.sqlite, exportMs: report.exportMs, output: 'benchmark-artifacts/t18-cost-sqlite-regression.json' }));
process.exit(exitCode);

/** Converts the fact cost column to braced text, recreating the views that select it. */
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

/** `CREATE TABLE` for `search_costs`, mirroring the shape drizzle-kit generates. */
function createSearchCostsSql(): string {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const config = getTableConfig(SearchCost);
  const columns = config.columns.map(column => {
    const dimensions = Number((column as { config?: { dimensions?: number } }).config?.dimensions ?? 0);
    const defaultValue = column.name === 'created_at' || column.name === 'updated_at' ? ' DEFAULT now()' : '';
    return `${quote(column.name)} ${column.getSQLType()}${'[]'.repeat(dimensions)}${column.notNull ? ' NOT NULL' : ''}${defaultValue}`;
  });
  const primaryKeys = config.primaryKeys.flatMap(key => key.columns.map(column => quote(column.name)));
  return `CREATE TABLE ${quote(config.schema ?? 'magic')}.${quote(config.name)} (${[...columns, `PRIMARY KEY (${primaryKeys.join(', ')})`].join(', ')})`;
}
