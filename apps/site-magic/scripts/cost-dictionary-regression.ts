import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getTableConfig } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import { translateLegacy } from '#search/server/translate';

import { runWithDb } from '@tcg-cards/db/db';
import { Card } from '@tcg-cards/db/schema/shared/magic/card';
import { SearchCardPart, SearchCost } from '@tcg-cards/db/schema/shared/magic/search';
import { SearchPublicationMetadata } from '#schema/shared/search-publication';
import { costDictionaryColumnsSql, costTokensSql } from '@tcg-cards/db/search-cost';

import { search } from '../server/search/index';
import * as magicCommands from '../server/search/command-list';
import { getMagicSearchManifest, refreshMagicSearchManifest } from '../server/search/accelerated-adapter';
import { cost as costHandler } from '../server/search/command/cost';

/**
 * Ticket 16/17 regression: inside one rolled back transaction the fact cost
 * column is converted to its braced text form when the local database still
 * holds arrays, the cost dictionary is installed, and then every accelerated
 * mana-cost predicate must return the same part identities as the original
 * text predicate over the live domain data, while covered DSL cases keep the
 * legacy action's card identity on the accelerated path.
 */

const pageSize = 20;

/** Part-level identity rows of one predicate result. */
type PartIdentity = Array<[string, string, number]>;

/** The drizzle transaction handle used for in-transaction reads. */
type DrizzleTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0];

/** One cost expression under the comparison shapes the public syntax allows. */
const expressions = [
  { id: 'colon-fixed', value: '{W}', operator: ':' },
  { id: 'colon-special', value: '{G/W}', operator: ':' },
  { id: 'colon-rare', value: '{2}{R}{D}', operator: ':' },
  { id: 'eq-single', value: 'W', operator: '=' },
  { id: 'eq-repeated', value: 'WW', operator: '=' },
  { id: 'eq-generic', value: '4CCC', operator: '=' },
  { id: 'eq-unmerged', value: '{2}{C}{C}{C}{2}', operator: '=' },
  { id: 'eq-half', value: 'H1', operator: '=' },
  { id: 'eq-phyrexian', value: '{W/U/P}', operator: '=' },
  { id: 'eq-null', value: 'null', operator: ':' },
  { id: 'lt-generic', value: 'W', operator: '<' },
  { id: 'lt-unknown', value: 'WV', operator: '<' },
  { id: 'gt-unknown', value: 'V', operator: '>' },
  { id: 'gt-strict', value: '{2}{W}', operator: '>' },
  { id: 'gte-strict', value: '{3}{W}', operator: '>=' },
  { id: 'gte-snow', value: 'S', operator: '>=' },
  { id: 'lte-repeated', value: '{3}{W}', operator: '<=' },
  { id: 'lte-x', value: 'X', operator: '<=' },
  { id: 'not-eq', value: 'W', operator: '=', qualifier: ['!'] },
  { id: 'not-gt', value: 'W', operator: '>', qualifier: ['!'] },
  { id: 'not-null', value: 'null', operator: ':', qualifier: ['!'] },
  { id: 'not-lte', value: '{2}{R}', operator: '<=', qualifier: ['!'] },
  { id: 'or-symbols', value: '{W}|{U}', operator: ':' },
  { id: 'and-symbols', value: '{W}&{U}', operator: ':' },
  { id: 'or-negated', value: '{W}|{U}', operator: ':', qualifier: ['!'] },
  { id: 'colorless', value: 'C', operator: ':' },
  { id: 'big-generic', value: '1000000', operator: '=' },
  { id: 'opaque-token', value: '{2R}', operator: '=' },
] as const;

const endToEndCases = [
  { id: 'cost-hybrid', q: 'cost:{W}{U}' },
  { id: 'cost-strict', q: 'cost>=2W c:u' },
  { id: 'cost-negated', q: '-cost:null cost:u' },
  { id: 'raw-mana', q: '{G}{G}' },
  { id: 'cost-phyrexian', q: 'mana:{B/P}' },
  { id: 'cost-null-union', q: 'cost:null type:creature' },
] as const;

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl == null) throw new Error('DATABASE_URL is missing');
const parsedUrl = new URL(databaseUrl);
if (parsedUrl.hostname !== 'localhost' || parsedUrl.port !== '5432' || parsedUrl.pathname !== '/local') {
  throw new Error('This regression is locked to localhost:5432/local.');
}
parsedUrl.hostname = '127.0.0.1';

type Observed = { sql: string, params: unknown[] };
const sqlObservations: Observed[] = [];
let observing = false;

const client = postgres(parsedUrl.toString(), { max: 1, connect_timeout: 5, application_name: 'magic-cost-dictionary-regression' });
const database = drizzle({
  client,
  logger: {
    logQuery(query, params) {
      if (observing) sqlObservations.push({ sql: query, params });
    },
  },
});

const rollback = new Error('ROLLBACK_COST_DICTIONARY_REGRESSION');

/** Token-array cost predicate over the domain part rows. */
function legacyPredicate(value: string, operator: string, qualifier: string[] = []) {
  return costHandler.call({
    args:   { value, operator, qualifier, argType: 'id' } as any,
    column: () => sql`p.cost` as any,
    ctx:    { meta: {}, table: {} } as any,
  });
}

/** Dictionary cost predicate over the accelerated part key column. */
function dictionaryPredicate(value: string, operator: string, qualifier: string[] = []) {
  return costHandler.call({
    args:   { value, operator, qualifier, argType: 'id' } as any,
    column: () => SearchCardPart.cost,
    ctx:    { meta: {}, table: { searchAcceleration: {}, costDictionary: SearchCost } } as any,
  });
}

/** Compiles a public DSL string into the legacy action's query and post steps. */
function legacyRequest(q: string) {
  const expression = simplify(new Parser(q).parse());
  return translateLegacy(expression, Object.values(magicCommands) as any, search.actions.search.table);
}

/** Plans a DSL string through the accelerated adapter exactly as the search action would. */
function planFor(q: string) {
  const request = resolveQueryRequest(simplify(new Parser(q).parse()), Object.values(magicCommands) as any, {
    sort:  [{ kind: 'request', field: 'order', value: 'id+' }],
    group: 'card',
    page:  1,
    pageSize,
    total: true,
    ambit: null,
    lang:  'en',
  });
  return search.actions.search.acceleratedAdapter?.plan(request) ?? { type: 'not-configured' };
}

/** The card-level identity fields one search result must keep across paths. */
function cardIdentity(result: any) {
  return {
    total:     result.total,
    page:      result.page,
    totalPage: result.totalPage,
    ambit:     result.ambit,
    rows:      result.result.map((row: any) => [row.cardId, row.version]),
  };
}

/** Sorts part identities so both paths compare deterministically. */
function compareIdentities(left: PartIdentity[number], right: PartIdentity[number]): number {
  return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]) || left[2] - right[2];
}

const report: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  rollback:    'the dictionary table, key column, metadata edit, and all queries run inside one transaction that is deliberately rolled back',
};
let exitCode = 0;

try {
  try {
    await database.transaction(async transaction => {
      // Ticket 17 moves the fact column to braced text; until that migration
      // is applied locally, perform the same deterministic conversion here.
      const [costColumn] = await transaction.execute(sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'magic' AND table_name = 'card_parts' AND column_name = 'cost'`) as Array<{ data_type: string }>;
      report.factColumnBefore = costColumn?.data_type ?? null;
      if (costColumn?.data_type === 'ARRAY') {
        report.recreatedViews = await convertCostColumnToText(transaction);
      }

      await transaction.execute(sql.raw(createSearchCostsSql()));
      await transaction.execute(sql`ALTER TABLE ${SearchCardPart} ADD COLUMN cost text`);

      const dictionaryStarted = performance.now();
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
        ) d`);
      const keyFillStarted = performance.now();
      await transaction.execute(sql`
        UPDATE ${SearchCardPart} s
        SET cost = p.cost
        FROM ${Card} c
        JOIN magic.card_parts p ON p.card_id = c.card_id AND p.version = c.version
        WHERE p.part_index = s.part_index
          AND s.card_id = p.card_id
          AND s.version = p.version
          AND s.deleted_at IS NULL AND c.deleted_at IS NULL AND p.deleted_at IS NULL`);
      report.buildMs = {
        dictionary: Math.round(keyFillStarted - dictionaryStarted),
        keyFill:    Math.round(performance.now() - keyFillStarted),
      };

      await transaction.execute(sql`
        UPDATE ${SearchPublicationMetadata}
        SET planner_metadata = planner_metadata || '{"costProjection": true}'::jsonb
        WHERE game = 'magic'`);
      await runWithDb(transaction as any, () => refreshMagicSearchManifest());
      const manifest = getMagicSearchManifest();
      if (manifest?.costProjection !== true) {
        throw new Error(`The planner did not adopt the cost projection: ${JSON.stringify(manifest)}`);
      }
      report.manifest = { costProjection: manifest.costProjection, dataVersion: manifest.dataVersion };

      // Predicate-level equivalence over every active part, per expression.
      const predicateResults: Array<Record<string, unknown>> = [];
      for (const expression of expressions) {
        const legacyRows = await partIdentities(transaction, sql`
          SELECT p.card_id, p.version, p.part_index
          FROM ${Card} c
          JOIN magic.card_parts p ON p.card_id = c.card_id AND p.version = c.version
          WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
            AND ${legacyPredicate(expression.value, expression.operator, expression.qualifier ?? [])}`);
        const acceleratedRows = await partIdentities(transaction, sql`
          SELECT ${SearchCardPart.cardId}, ${SearchCardPart.version}, ${SearchCardPart.partIndex}
          FROM ${SearchCardPart}
          WHERE ${SearchCardPart.deletedAt} IS NULL
            AND ${dictionaryPredicate(expression.value, expression.operator, expression.qualifier ?? [])}`);

        const match = JSON.stringify(legacyRows) === JSON.stringify(acceleratedRows);
        if (!match) {
          exitCode = 1;
          report[`${expression.id}Mismatch`] = {
            legacyCount:      legacyRows.length,
            acceleratedCount: acceleratedRows.length,
            legacyOnly:       difference(legacyRows, acceleratedRows).slice(0, 5),
            acceleratedOnly:  difference(acceleratedRows, legacyRows).slice(0, 5),
          };
        }
        predicateResults.push({
          id:          expression.id,
          legacy:      legacyRows.length,
          accelerated: acceleratedRows.length,
          match,
        });
      }
      report.predicateEquivalence = {
        allMatch: predicateResults.every(item => item.match === true),
        results:  predicateResults,
      };

      // End-to-end: legacy action versus the routed search action.
      const caseRuns: Array<Record<string, unknown>> = [];
      for (const benchmarkCase of endToEndCases) {
        const plan = String(planFor(benchmarkCase.q).type);
        if (plan !== 'exact') {
          throw new Error(`${benchmarkCase.id}: plan ${plan} != exact`);
        }

        const legacyQuery = legacyRequest(benchmarkCase.q);
        const options = { page: 1, pageSize, lang: 'en' as const, groupBy: 'card', orderBy: 'id+', dsl: benchmarkCase.q };
        const legacy = await runWithDb(transaction as any, () => search.actions.search.handler(legacyQuery.query!, legacyQuery.post, options));
        const legacyIdentity = cardIdentity(legacy);

        sqlObservations.length = 0;
        observing = true;
        const acceleratedStarted = performance.now();
        const action = await runWithDb(transaction as any, () => search.search('search', benchmarkCase.q, options));
        const acceleratedMs = Math.round(performance.now() - acceleratedStarted);
        observing = false;
        const identity = cardIdentity(action.result);

        const match = JSON.stringify(legacyIdentity) === JSON.stringify(identity);
        if (!match) {
          exitCode = 1;
          report[`${benchmarkCase.id}Mismatch`] = { legacy: legacyIdentity, accelerated: identity };
        }
        caseRuns.push({
          id:                  benchmarkCase.id,
          plan,
          total:               identity.total,
          identityMatch:       match,
          acceleratedMs,
          acceleratedSqlCount: sqlObservations.length,
          hitSearchCosts:      sqlObservations.some(item => item.sql.includes('search_costs')),
        });
      }
      report.endToEnd = { allMatch: caseRuns.every(item => item.identityMatch === true), cases: caseRuns };

      // Execution plans: accelerated dictionary predicates versus the token-array baseline.
      const plans: Array<Record<string, string | number>> = [];
      const planTargets = [
        { id: 'accelerated-gte-2w', query: sql`SELECT count(*) FROM ${SearchCardPart} WHERE ${SearchCardPart.deletedAt} IS NULL AND ${dictionaryPredicate('2W', '>=')}` },
        { id: 'accelerated-eq-hybrid', query: sql`SELECT count(*) FROM ${SearchCardPart} WHERE ${SearchCardPart.deletedAt} IS NULL AND ${dictionaryPredicate('{G/W}', '=')}` },
        { id:    'legacy-gte-2w', query: sql`SELECT count(*) FROM ${Card} c JOIN magic.card_parts p ON p.card_id = c.card_id AND p.version = c.version
            WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND ${legacyPredicate('2W', '>=')}` },
        { id:    'legacy-eq-hybrid', query: sql`SELECT count(*) FROM ${Card} c JOIN magic.card_parts p ON p.card_id = c.card_id AND p.version = c.version
            WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND ${legacyPredicate('{G/W}', '=')}` },
      ];
      for (const target of planTargets) {
        const root = (await explainTree(transaction, target.query))[0]!;
        const plan = root['Plan'] as Record<string, unknown>;
        plans.push({
          id:              target.id,
          planningMs:      Number(root['Planning Time'] ?? 0),
          executionMs:     Number(root['Execution Time'] ?? 0),
          sharedHitBlocks: Number(plan['Shared Hit Blocks'] ?? 0),
          planSummary:     summarizePlan([plan]),
        });
      }
      report.plans = plans;

      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }

  const [installed] = await client.unsafe(
    `SELECT to_regclass('magic.search_costs')::text AS costs,
       (SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'magic' AND table_name = 'search_card_parts' AND column_name = 'cost') AS key`,
  );
  const [factColumn] = await client.unsafe(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'magic' AND table_name = 'card_parts' AND column_name = 'cost'`,
  );
  report.afterRollback = { costsTable: installed?.costs ?? null, keyColumn: installed?.key ?? null, factColumn: factColumn?.data_type ?? null };
  if (installed?.costs != null || installed?.key != null || factColumn?.data_type !== report.factColumnBefore) {
    exitCode = 1;
  }

  await writeFile(
    resolve(import.meta.dir, '../../../.scratch/search-acceleration/benchmark-artifacts/t16-cost-dictionary-regression.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    allPredicateMatch: (report.predicateEquivalence as { allMatch: boolean }).allMatch,
    endToEndMatch:     (report.endToEnd as { allMatch: boolean }).allMatch,
    buildMs:           report.buildMs,
    output:            'benchmark-artifacts/t16-cost-dictionary-regression.json',
  }));
} finally {
  await client.end();
}

process.exit(exitCode);

/** Returns rows of `left` that do not appear in `right`. */
function difference(left: PartIdentity, right: PartIdentity): PartIdentity {
  const rightSet = new Set(right.map(row => JSON.stringify(row)));
  return left.filter(row => !rightSet.has(JSON.stringify(row)));
}

/** Runs one part-level query inside the transaction and returns its sorted identities. */
async function partIdentities(transaction: DrizzleTransaction, query: SQL): Promise<PartIdentity> {
  const rows = await transaction.execute(query) as Array<Record<string, unknown>>;
  return rows
    .map(row => [String(row.card_id), String(row.version), Number(row.part_index)] as PartIdentity[number])
    .sort(compareIdentities);
}

/** The full explain tree of one query, for plan summaries. */
async function explainTree(transaction: DrizzleTransaction, query: SQL): Promise<Array<Record<string, unknown>>> {
  const [row] = await transaction.execute(sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`) as Array<{ 'QUERY PLAN': Array<Record<string, unknown>> }>;
  return row!['QUERY PLAN'];
}

/** Flattens a JSON explain tree into one line of node types. */
function summarizePlan(nodes: Array<Record<string, unknown>>): string {
  const lines: string[] = [];
  const walk = (node: Record<string, unknown>, depth: number) => {
    lines.push(`${'  '.repeat(depth)}${node['Node Type']}${node['Index Name'] != null ? ` [${node['Index Name']}]` : ''}${node['Relation Name'] != null ? ` on ${node['Relation Name']}` : ''}`);
    for (const child of (node['Plans'] ?? []) as Array<Record<string, unknown>>) {
      walk(child, depth + 1);
    }
  };
  for (const node of nodes) {
    walk(node, 0);
  }
  return lines.join(' / ');
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

/** `CREATE TABLE` for `search_costs`, mirroring the shape drizzle-kit would generate. */
function createSearchCostsSql(): string {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const config = getTableConfig(SearchCost);
  const columns = config.columns.map(column => {
    // Drizzle emits the base type only, so array markers come from the column config.
    const dimensions = Number((column as { config?: { dimensions?: number } }).config?.dimensions ?? 0);
    const defaultValue = column.name === 'created_at' || column.name === 'updated_at' ? ' DEFAULT now()' : '';
    return `${quote(column.name)} ${column.getSQLType()}${'[]'.repeat(dimensions)}${column.notNull ? ' NOT NULL' : ''}${defaultValue}`;
  });
  const primaryKeys = config.primaryKeys.flatMap(key => key.columns.map(column => quote(column.name)));
  return `CREATE TABLE ${quote(config.schema ?? 'magic')}.${quote(config.name)} (${[...columns, `PRIMARY KEY (${primaryKeys.join(', ')})`].join(', ')})`;
}
