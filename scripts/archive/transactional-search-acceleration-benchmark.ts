// Archived: this ticket-04 benchmark rebuilt the Magic search projection inside
// a transaction through the deprecated `service-desktop-runtime` package, which
// no workspace package depends on any more. It is kept for reference only and
// no longer runs; its measurements are recorded in the search-acceleration
// benchmark artifacts.

import { resolve } from 'node:path';

import { SQL, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { runWithDb } from '@tcg-cards/db/db';
import { SearchCard, SearchCardPart, SearchCardPartLocalization } from '@tcg-cards/db/schema/shared/magic/search';
import { buildMagicSearchManifest, rebuildMagicSearchData } from '../../service-desktop-runtime/src/lib/magic/project/search-data';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import { translateLegacy } from '#search/server/translate';

import { search } from '../server/search/index';
import * as magicCommands from '../server/search/command-list';
import { setMagicSearchManifest } from '../server/search/accelerated-adapter';

const cases = [
  { id: 'name', q: 'n:"Black Lotus"', page: 1 },
  { id: 'mana-value', q: 'mv=1', page: 1 },
  { id: 'mana-value-color', q: 'mv=1 c:U', page: 1 },
  { id: 'card-only-tag', q: '#dev:token', page: 1 },
  { id: 'body-text', q: 'o:"draw a card"', page: 1 },
  { id: 'nested-logic', q: 't:creature (c:U|c:B) -mv:0', page: 1 },
  { id: 'ambit', q: 'ambit:primary t:creature', page: 1 },
  { id: 'pagination-first', q: 't:creature', page: 1 },
  { id: 'pagination-deep', q: 't:creature', page: 100 },
  { id: 'pagination-empty', q: 'n:"Black Lotus"', page: 2 },
  { id: 'set-fallback', q: 'set:lea', page: 1 },
  { id: 'hard-regex', q: 'o:/draw.{0,24}card/', page: 1 },
  {
    id:                     'localized-name',
    q:                      'n:"黑莲花"',
    page:                   1,
    expectedRepresentative: { cardId: 'blacker-lotus', locale: 'zhs', source: 'mtgch', partIndex: 0 },
  },
] as const;

const secondaryIndexSql = [
  'CREATE INDEX IF NOT EXISTS "search_cards_mana_value_idx" ON "magic"."search_cards" ("mana_value")',
  'CREATE INDEX IF NOT EXISTS "search_cards_tags_gin_idx" ON "magic"."search_cards" USING gin ("tags")',
] as const;

const pageSize = 20;
const language = 'en' as const;
const rollback = new Error('ROLLBACK_TRANSACTIONAL_SEARCH_BENCHMARK');
const sqlObservations: Array<{ caseId: string, path: string, sql: string, params: unknown[] }> = [];
let activeContext: { caseId: string, path: 'legacy-pg' | 'search-action' | 'essential-search-action' } | null = null;

function quote(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function createTableSql(table: typeof SearchCard | typeof SearchCardPart | typeof SearchCardPartLocalization) {
  const config = getTableConfig(table);
  const schemaName = config.schema ?? 'magic';
  const columns = config.columns.map(column => {
    const dimensions = Number((column as any).config.dimensions ?? 0);
    const enumType = (column as any).enum;
    const type = (column.enumValues?.length ?? 0) > 0
      ? enumType.schema == null
        ? quote(enumType.enumName)
        : `${quote(enumType.schema)}.${quote(enumType.enumName)}`
      : `${column.getSQLType()}${'[]'.repeat(dimensions)}`;
    const defaultValue = column.name === 'created_at' || column.name === 'updated_at'
      ? ' DEFAULT now()'
      : column.name === 'version' || column.name === 'source'
        ? ' DEFAULT \'\''
        : '';
    return `${quote(column.name)} ${type}${column.notNull ? ' NOT NULL' : ''}${defaultValue}`;
  });
  const primaryKeys = config.primaryKeys.flatMap(key => key.columns.map(column => quote(column.name)));
  return `CREATE TABLE ${quote(schemaName)}.${quote(config.name)} (${[...columns, `PRIMARY KEY (${primaryKeys.join(', ')})`].join(', ')})`;
}

function identity(normal: any) {
  return {
    total:     normal.total,
    page:      normal.page,
    totalPage: normal.totalPage,
    ambit:     normal.ambit,
    rows:      normal.result.map((row: any) => [row.cardId, row.version, row.locale, row.source, row.partIndex, row.lang, row.set, row.number]),
  };
}

function cardIdentity(normal: any) {
  return {
    total:     normal.total,
    page:      normal.page,
    totalPage: normal.totalPage,
    ambit:     normal.ambit,
    rows:      normal.result.map((row: any) => [row.cardId, row.version]),
  };
}

function essentialDisplayRows(normal: any) {
  return normal.result.map((row: any) => [
    row.cardId,
    row.version,
    row.locale,
    row.source,
    row.partIndex,
    row.lang,
    row.set,
    row.number,
    row.cardPartLocalization.name,
    row.cardPartLocalization.rubyName ?? null,
    row.print.layout,
    row.print.imageType,
    row.print.imageStatus,
  ]);
}

function fullDisplayRows(normal: any) {
  return normal.result.map((row: any) => [
    row.cardId,
    row.version,
    row.locale,
    row.source,
    row.partIndex,
    row.lang,
    row.set,
    row.number,
    row.cardPartLocalization.name,
    row.cardPartLocalization.rubyName ?? null,
    row.print.layout,
    row.print.imageInfo?.[0]?.type ?? 'webp',
    row.print.imageStatus,
  ]);
}

function essentialSourceReads(statements: typeof sqlObservations) {
  const sourceTables = [
    '"magic"."cards"',
    '"magic"."card_localizations"',
    '"magic"."card_parts"',
    '"magic"."card_part_localizations"',
    '"magic"."prints"',
    '"magic"."print_parts"',
    '"magic"."card_print_view"',
  ];

  return statements.filter(statement => sourceTables.some(table => statement.sql.includes(table)));
}

function representativeDifferences(legacy: any, accelerated: any) {
  const legacyRows = identity(legacy).rows;
  const acceleratedRows = identity(accelerated).rows;
  const differences: Array<{ index: number, legacy: unknown[], accelerated: unknown[] }> = [];
  for (let index = 0; index < Math.min(legacyRows.length, acceleratedRows.length); index++) {
    if (JSON.stringify(legacyRows[index]) !== JSON.stringify(acceleratedRows[index])) {
      differences.push({ index, legacy: legacyRows[index], accelerated: acceleratedRows[index] });
    }
  }
  return differences;
}

function planFor(benchmarkCase: typeof cases[number]) {
  const expression = simplify(new Parser(benchmarkCase.q).parse());
  const request = resolveQueryRequest(expression, Object.values(magicCommands) as any, {
    sort:  [{ kind: 'request', field: 'order', value: 'id+' }],
    group: 'card',
    page:  benchmarkCase.page,
    pageSize,
    total: true,
    ambit: null,
    lang:  language,
  });
  return search.actions.search.acceleratedAdapter?.plan(request) ?? { type: 'not-configured' };
}

function explainSql(statement: { sql: string, params: unknown[] }) {
  const chunks: any[] = [sql.raw('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ')];
  const placeholder = /\$(\d+)/g;
  let offset = 0;
  for (const match of statement.sql.matchAll(placeholder)) {
    const index = match.index!;
    chunks.push(sql.raw(statement.sql.slice(offset, index)));
    chunks.push(sql.param(statement.params[Number(match[1]) - 1]));
    offset = index + match[0].length;
  }
  chunks.push(sql.raw(statement.sql.slice(offset)));
  return new SQL(chunks);
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl == null) throw new Error('DATABASE_URL is missing');
const parsedUrl = new URL(databaseUrl);
if (parsedUrl.hostname !== 'localhost' || parsedUrl.port !== '5432' || parsedUrl.pathname !== '/local') {
  throw new Error('This diagnostic is locked to localhost:5432/local.');
}
parsedUrl.hostname = '127.0.0.1';
const client = postgres(parsedUrl.toString(), { max: 1, connect_timeout: 5, application_name: 'search-acceleration-transactional-benchmark' });
const database = drizzle({
  client,
  logger: {
    logQuery(query, params) {
      if (activeContext != null) sqlObservations.push({ ...activeContext, sql: query, params });
    },
  },
});
const startedAt = new Date().toISOString();
const reportPath = resolve(import.meta.dir, '../../../.scratch/search-acceleration/benchmark-artifacts/magic-search-acceleration-transactional-smoke.json');
const profileOnly = process.env.BENCH_PROFILE_ONLY === '1';
const caseFilter = process.env.BENCH_CASE_ID;
const selectedCases = caseFilter == null ? cases : cases.filter(benchmarkCase => benchmarkCase.id === caseFilter);
if (selectedCases.length === 0) throw new Error(`No benchmark case matches BENCH_CASE_ID=${caseFilter}`);
const outputPath = caseFilter == null
  ? reportPath
  : resolve(import.meta.dir, `../../../.scratch/search-acceleration/benchmark-artifacts/${caseFilter}-regression.json`);
let report: Record<string, unknown> | null = null;

try {
  try {
    const previousReport = profileOnly ? await Bun.file(reportPath).json() as Record<string, any> : null;
    if (previousReport != null) sqlObservations.push(...previousReport.sqlObservations);
    await database.transaction(async transaction => {
      try {
        const existingTables = (await transaction.execute(sql`
          SELECT
            to_regclass('magic.search_cards') AS search_cards,
            to_regclass('magic.search_card_parts') AS search_card_parts,
            to_regclass('magic.search_card_part_localizations') AS search_card_part_localizations`)) as any[];
        const tableFlags = Object.values(existingTables[0] ?? {}).map(value => value != null);

        if (tableFlags.every(exists => !exists)) {
          for (const table of [SearchCard, SearchCardPart, SearchCardPartLocalization]) {
            await transaction.execute(sql.raw(createTableSql(table)));
          }
        } else if (tableFlags.every(Boolean)) {
          const existingCounts = (await transaction.execute(sql`
            SELECT
              (SELECT count(*) FROM ${SearchCard})::int AS cards,
              (SELECT count(*) FROM ${SearchCardPart})::int AS parts,
              (SELECT count(*) FROM ${SearchCardPartLocalization})::int AS localizations`)) as any[];
          const counts = Object.values(existingCounts[0] ?? {}).map(Number);
          if (counts.some(count => count !== 0)) {
            throw new Error(`Refusing to rebuild non-empty search tables: ${JSON.stringify(existingCounts[0])}`);
          }

          const localizationColumns = (await transaction.execute(sql`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'magic'
              AND table_name = 'search_card_part_localizations'`)) as Array<{ column_name: string }>;
          if (!localizationColumns.some(column => column.column_name === 'ruby_name')) {
            await transaction.execute(sql.raw('ALTER TABLE "magic"."search_card_part_localizations" ADD COLUMN "ruby_name" text'));
          }
        } else {
          throw new Error('Refusing to benchmark with only some Magic search tables present.');
        }
        for (const statement of secondaryIndexSql) await transaction.execute(sql.raw(statement));

        const buildStartedAt = performance.now();
        await rebuildMagicSearchData(transaction as any);
        const manifest = await buildMagicSearchManifest(transaction as any, 'ticket04-transactional-local');
        setMagicSearchManifest(manifest);
        const buildDurationMs = performance.now() - buildStartedAt;

        const results: Array<Record<string, unknown>> = previousReport?.cases ?? [];
        if (!profileOnly) for (const benchmarkCase of selectedCases) {
          const options = {
            page:    benchmarkCase.page,
            pageSize,
            lang:    language,
            groupBy: 'card',
            orderBy: 'id+',
            dsl:     benchmarkCase.q,
          };
          const expression = simplify(new Parser(benchmarkCase.q).parse());
          const translated = translateLegacy(expression, Object.values(magicCommands) as any, search.actions.search.table);
          if (translated.query == null) throw new Error(`${benchmarkCase.id}: legacy query resolved to no SQL`);

          activeContext = { caseId: benchmarkCase.id, path: 'legacy-pg' };
          const legacyStartedAt = performance.now();
          const legacy = await runWithDb(transaction as any, () => search.actions.search.handler(translated.query!, translated.post, options));
          const legacyMs = performance.now() - legacyStartedAt;
          activeContext = null;

          activeContext = { caseId: benchmarkCase.id, path: 'search-action' };
          const acceleratedStartedAt = performance.now();
          const action = await runWithDb(transaction as any, () => search.search('search', benchmarkCase.q, options));
          const acceleratedMs = performance.now() - acceleratedStartedAt;
          activeContext = null;
          if (action.errors.length > 0 || action.result == null) {
            throw new Error(`${benchmarkCase.id}: search action failed: ${JSON.stringify(action.errors)}`);
          }
          if ('expectedRepresentative' in benchmarkCase) {
            for (const [path, result] of [['legacy PG', legacy], ['search action', action.result]] as const) {
              const actual = result.result[0] as any;
              for (const [field, expected] of Object.entries(benchmarkCase.expectedRepresentative)) {
                if (actual?.[field] !== expected) {
                  throw new Error(`${benchmarkCase.id}: ${path} representative ${field} mismatch: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual?.[field])}`);
                }
              }
            }
          }

          const legacyIdentity = identity(legacy);
          const actionIdentity = identity(action.result);
          const legacyCardIdentity = cardIdentity(legacy);
          const actionCardIdentity = cardIdentity(action.result);
          const accelerationPlan = planFor(benchmarkCase);
          if (JSON.stringify(legacyCardIdentity) !== JSON.stringify(actionCardIdentity)) {
            throw new Error(`${benchmarkCase.id}: card result mismatch: legacy=${JSON.stringify(legacyCardIdentity)} action=${JSON.stringify(actionCardIdentity)}`);
          }
          const representativeDiffs = representativeDifferences(legacy, action.result);

          activeContext = { caseId: benchmarkCase.id, path: 'essential-search-action' };
          const essentialStartedAt = performance.now();
          const essentialAction = await runWithDb(transaction as any, () => search.search('essential', benchmarkCase.q, options));
          const essentialMs = performance.now() - essentialStartedAt;
          activeContext = null;
          if (essentialAction.errors.length > 0 || essentialAction.result == null) {
            throw new Error(`${benchmarkCase.id}: essential search action failed: ${JSON.stringify(essentialAction.errors)}`);
          }

          if (JSON.stringify(identity(action.result)) !== JSON.stringify(identity(essentialAction.result))) {
            throw new Error(`${benchmarkCase.id}: essential result identity/order/page mismatch`);
          }
          if (JSON.stringify(fullDisplayRows(action.result)) !== JSON.stringify(essentialDisplayRows(essentialAction.result))) {
            throw new Error(`${benchmarkCase.id}: essential display projection mismatch`);
          }

          const essentialStatements = sqlObservations.filter(row => row.caseId === benchmarkCase.id && row.path === 'essential-search-action');
          const sourceReads = essentialSourceReads(essentialStatements);
          if (accelerationPlan.type === 'exact' && sourceReads.length > 0) {
            throw new Error(`${benchmarkCase.id}: essential exact path read source tables: ${JSON.stringify(sourceReads.map(row => row.sql))}`);
          }
          const basicPayloadBytes = new TextEncoder().encode(JSON.stringify(action)).byteLength;
          const essentialPayloadBytes = new TextEncoder().encode(JSON.stringify(essentialAction)).byteLength;

          results.push({
            caseId:                           benchmarkCase.id,
            accelerationPlan,
            cardIdentity:                     legacyCardIdentity,
            legacyRepresentative:             legacyIdentity.rows,
            acceleratedRepresentative:        actionIdentity.rows,
            representativeDifferenceCount:    representativeDiffs.length,
            representativeDifferenceExamples: representativeDiffs.slice(0, 3),
            legacyPg:                         { elapsedMs: legacyMs, actionElapsedMs: legacy.elapsed },
            searchAction:                     { elapsedMs: acceleratedMs, actionElapsedMs: action.result.elapsed },
            essentialSearchAction:            { elapsedMs: essentialMs, actionElapsedMs: essentialAction.result.elapsed },
            responseBytes:                    { basic: basicPayloadBytes, essential: essentialPayloadBytes },
            essentialSourceReads:             sourceReads.length,
            sqlCounts:                        {
              legacyPg:              sqlObservations.filter(row => row.caseId === benchmarkCase.id && row.path === 'legacy-pg').length,
              searchAction:          sqlObservations.filter(row => row.caseId === benchmarkCase.id && row.path === 'search-action').length,
              essentialSearchAction: essentialStatements.length,
            },
          });
        }

        const sizes = await transaction.execute(sql`
          SELECT relname AS table, pg_total_relation_size(oid)::bigint AS bytes
          FROM pg_class
          WHERE oid IN (
            'magic.search_cards'::regclass,
            'magic.search_card_parts'::regclass,
            'magic.search_card_part_localizations'::regclass
          )
          ORDER BY relname`);
        const rowCounts = await transaction.execute(sql`
          SELECT 'search_cards' AS table_name, count(*)::bigint AS rows FROM ${SearchCard}
          UNION ALL SELECT 'search_card_parts', count(*)::bigint FROM ${SearchCardPart}
          UNION ALL SELECT 'search_card_part_localizations', count(*)::bigint FROM ${SearchCardPartLocalization}
          ORDER BY table_name`);
        const profiling: Array<Record<string, unknown>> = [];
        for (const caseId of ['mana-value', 'mana-value-color', 'card-only-tag', 'body-text'] as const) {
          for (const path of ['legacy-pg', 'search-action'] as const) {
            const statements = sqlObservations.filter(row => row.caseId === caseId && row.path === path);
            for (const [statementIndex, statement] of statements.entries()) {
              const explain = await transaction.execute(explainSql(statement));
              profiling.push({ caseId, path, statementIndex, statement: statement.sql, params: statement.params, explain });
            }
          }
        }
        const version = (await transaction.execute(sql`SELECT current_setting('server_version') AS version`) as any[])[0]?.version;
        report = {
          kind:                            'transactional diagnostic smoke; one internal sample per path/case; no API sampling',
          startedAt:                       previousReport?.startedAt ?? startedAt,
          profiledAt:                      new Date().toISOString(),
          finishedAt:                      new Date().toISOString(),
          database:                        'local',
          postgresVersion:                 version,
          dataVersion:                     manifest.dataVersion,
          projectionAndManifestDurationMs: buildDurationMs,
          tableSizes:                      sizes,
          tableRowCounts:                  rowCounts,
          profiling,
          resultComparison:                'card/version membership and order, totals, pages, and ambit matched for all fixed cases',
          representativeComparison:        'reported separately; the legacy DISTINCT ON ordering omits CardLocalization locale/source tie-breakers, so its representative detail row can be arbitrary among language-priority ties',
          cases:                           results,
          sqlObservations,
          rollback:                        'all DDL, indexes, and projection rows added by this run are inside a transaction that is deliberately rolled back; pre-existing tables are preserved',
        };

        await Bun.write(outputPath, JSON.stringify(report, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
        console.log(JSON.stringify({
          reportPath:                      outputPath,
          projectionAndManifestDurationMs: buildDurationMs,
          cases:                           results.map(item => ({
            caseId:                           item.caseId,
            plan:                             (item.accelerationPlan as any).type,
            legacyMs:                         (item.legacyPg as any).elapsedMs,
            searchActionMs:                   (item.searchAction as any).elapsedMs,
            sqlCounts:                        item.sqlCounts,
            representativeDifferenceCount:    item.representativeDifferenceCount,
            representativeDifferenceExamples: item.representativeDifferenceExamples,
          })),
          tableSizes:     sizes,
          tableRowCounts: rowCounts,
          profiling:      profiling.map(item => ({ caseId: item.caseId, path: item.path, statementIndex: item.statementIndex, explain: item.explain })),
        }, null, 2));
      } finally {
        activeContext = null;
        setMagicSearchManifest(null);
      }

      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
} finally {
  setMagicSearchManifest(null);
  await client.end();
}

if (report == null) throw new Error('The benchmark report was not produced.');
