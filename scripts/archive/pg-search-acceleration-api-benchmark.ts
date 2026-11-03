// Archived: this ticket-04 benchmark imported the Magic search projection
// rebuild from the deprecated `service-desktop-runtime` package, which no
// workspace package depends on any more. It is kept for reference only and
// no longer runs; its measurements are recorded in the search-acceleration
// benchmark artifacts.

import { resolve } from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { SearchCard, SearchCardPart, SearchCardPartLocalization } from '@tcg-cards/db/schema/shared/magic/search';
import { rebuildMagicSearchData } from '../../service-desktop-runtime/src/lib/magic/project/search-data';

const tables = [SearchCard, SearchCardPart, SearchCardPartLocalization] as const;
const secondaryIndexSql = [
  'CREATE INDEX "search_cards_mana_value_idx" ON "magic"."search_cards" ("mana_value")',
  'CREATE INDEX "search_cards_tags_gin_idx" ON "magic"."search_cards" USING gin ("tags")',
] as const;

function quote(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function createTableSql(table: typeof SearchCard | typeof SearchCardPart | typeof SearchCardPartLocalization) {
  const config = getTableConfig(table);
  const schema = config.schema ?? 'magic';
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
  return `CREATE TABLE ${quote(schema)}.${quote(config.name)} (${[...columns, `PRIMARY KEY (${primaryKeys.join(', ')})`].join(', ')})`;
}

function localDatabaseUrl(configuredUrl: string) {
  const url = new URL(configuredUrl);
  if (url.pathname !== '/local' || url.port !== '5432') {
    throw new Error('This API benchmark fixture is locked to localhost:5432/local.');
  }
  if (url.hostname === 'localhost' || url.hostname === '::1') url.hostname = '127.0.0.1';
  return url.toString();
}

const configuredUrl = process.env.DATABASE_URL;
if (configuredUrl == null) throw new Error('DATABASE_URL is missing; load ../../scripts/.env.');
const databaseUrl = localDatabaseUrl(configuredUrl);
const client = postgres(databaseUrl, { max: 1, connect_timeout: 5, application_name: 'search-acceleration-api-benchmark-fixture' });
const database = drizzle({ client });
const appRoot = import.meta.dir.replace(/\/scripts$/, '');
const tableNames = tables.map(table => `${getTableConfig(table).schema ?? 'magic'}.${getTableConfig(table).name}`);
const created: string[] = [];

try {
  const existing = await client.unsafe(
    `SELECT name, to_regclass(name) AS relation FROM unnest($1::text[]) AS name`,
    [tableNames],
  );
  const occupied = existing.filter(row => row.relation != null);
  if (occupied.length > 0) {
    throw new Error(`Refusing to replace existing search tables: ${occupied.map(row => row.name).join(', ')}`);
  }

  for (const table of tables) {
    const config = getTableConfig(table);
    const qualifiedName = `${config.schema ?? 'magic'}.${config.name}`;
    await client.unsafe(createTableSql(table));
    created.push(qualifiedName);
  }
  for (const statement of secondaryIndexSql) await client.unsafe(statement);

  const buildStartedAt = performance.now();
  await rebuildMagicSearchData(database as any);
  const buildDurationMs = performance.now() - buildStartedAt;

  const mismatches = await client.unsafe(`
    SELECT count(*)::int AS mismatch_count
    FROM magic.search_cards s
    LEFT JOIN (
      SELECT p.card_id, p.version,
        array_agg(DISTINCT p.rarity ORDER BY p.rarity) AS rarities
      FROM magic.prints p
      WHERE p.deleted_at IS NULL
      GROUP BY p.card_id, p.version
    ) expected USING (card_id, version)
    WHERE s.deleted_at IS NULL
      AND s.rarities IS DISTINCT FROM COALESCE(expected.rarities, ARRAY[]::text[])
  `);
  const mismatchCount = Number(mismatches[0]?.mismatch_count ?? 0);
  if (mismatchCount !== 0) {
    throw new Error(`Rarity summary differs from active print data for ${mismatchCount} search cards.`);
  }

  const [projectionMetrics] = await client.unsafe(`
    SELECT
      count(*)::bigint AS active_search_cards,
      COALESCE(sum(cardinality(rarities)), 0)::bigint AS distinct_rarity_entries,
      COALESCE(sum(pg_column_size(rarities)), 0)::bigint AS rarity_array_bytes,
      pg_total_relation_size('magic.search_cards')::bigint AS search_cards_total_bytes
    FROM magic.search_cards
    WHERE deleted_at IS NULL
  `);
  const summaryPlan = await client.unsafe(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT p.card_id, p.version, array_agg(DISTINCT p.rarity ORDER BY p.rarity) AS rarities
    FROM magic.prints p
    WHERE p.deleted_at IS NULL
    GROUP BY p.card_id, p.version
  `);
  const evidencePath = resolve(
    import.meta.dir,
    '../../../.scratch/search-acceleration/benchmark-artifacts',
    `magic-rarity-projection-${new Date().toISOString().replaceAll(':', '-')}.json`,
  );
  const evidence = {
    generatedAt:            new Date().toISOString(),
    buildDurationMs,
    correctness:            { mismatchedCards: mismatchCount },
    projectionMetrics,
    summaryAggregationPlan: summaryPlan[0]?.['QUERY PLAN'] ?? summaryPlan,
  };
  await Bun.write(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`Built temporary PG search projection in ${buildDurationMs.toFixed(1)} ms.`);
  console.log(`Rarity projection verified; evidence: ${evidencePath}`);

  const child = Bun.spawn(['bun', '--env-file=../../scripts/.env', 'scripts/pg-search-benchmark.ts'], {
    cwd: appRoot,
    env: {
      ...process.env,
      DATABASE_URL:                                             databaseUrl,
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
      BENCH_WARMUPS:                                            process.env.BENCH_WARMUPS ?? '2',
      BENCH_SAMPLES:                                            process.env.BENCH_SAMPLES ?? '20',
      BENCH_EXPLAIN_LIMIT:                                      process.env.BENCH_EXPLAIN_LIMIT ?? '2',
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`The API benchmark exited with code ${exitCode}.`);
} finally {
  for (const qualifiedName of created.reverse()) {
    const [schema, name] = qualifiedName.split('.');
    await client.unsafe(`DROP TABLE IF EXISTS ${quote(schema!)}.${quote(name!)}`).catch(error => {
      console.error(`Failed to clean up temporary benchmark table ${qualifiedName}:`, error);
      throw error;
    });
  }
  await client.end();
}
