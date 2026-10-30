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
  console.log(`Built temporary PG search projection in ${(performance.now() - buildStartedAt).toFixed(1)} ms.`);

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
