import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PgDialect } from 'drizzle-orm/pg-core';
import Parser from '@tcg-cards/search/src/parser';
import { simplify } from '@tcg-cards/search/src/parser/simplify';
import { resolveQueryRequest } from '@tcg-cards/search/src/server/logical';
import type { CommonServerCommand } from '@tcg-cards/search/src/server/command';
import { projectedSearchQuery, snapshotRows } from './d1-source';
import { createSnapshotStatements, snapshotDdl } from './d1-snapshot';
import { HearthstoneD1EssentialSearchAdapter } from '../server/search/d1/adapter';
import {
  HearthstonePgEssentialSearchAdapter,
  setHearthstoneSearchDataset,
} from '../server/search/accelerated-adapter';
import * as commands from '../server/search/command-list';
import type { HearthstoneSearchD1Database } from '../server/search/d1/types';
import type { SearchOption } from '../server/search/action';
import { essentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';

const dataVersion = 't10-live-sorting-20261101';
const cases = [
  ...['name', 'id', 'set', 'cost', 'attack', 'health', 'stats', 'type', 'class'].flatMap(field =>
    ['+', '-'].map(direction => ({
      id:       `${field}${direction}`,
      dsl:      'cost>=0',
      orderBy:  `${field}${direction}`,
      page:     1,
      pageSize: 20,
      lang:     'en' as const,
    })),
  ),
  {
    id:       'multi',
    dsl:      'lang:en|de cost>=0',
    orderBy:  'name+',
    page:     1,
    pageSize: 20,
    lang:     'en' as const,
  },
  { id: 'zh', dsl: 'cost>=0', orderBy: 'name+', page: 1, pageSize: 20, lang: 'zhs' as const },
  {
    id:       'compound',
    dsl:      'cost>=0',
    orderBy:  'cost-,id-',
    page:     1,
    pageSize: 20,
    lang:     'en' as const,
  },
  {
    id:       'dsl',
    dsl:      'cost>=0 order:stats-',
    orderBy:  'name+',
    page:     1,
    pageSize: 20,
    lang:     'en' as const,
  },
  { id: 'deep', dsl: 'cost>=0', orderBy: 'name+', page: 100, pageSize: 20, lang: 'en' as const },
  {
    id:       'empty',
    dsl:      'cost>=0',
    orderBy:  'name+',
    page:     999999,
    pageSize: 20,
    lang:     'en' as const,
  },
];
/** Resolves the actual game DSL using the same essential contract. */
function request(entry: (typeof cases)[number]) {
  return resolveQueryRequest(
    simplify(new Parser(entry.dsl).parse()),
    Object.values(commands) as CommonServerCommand[],
    {
      sort:     [{ kind: 'request', field: 'order', value: entry.orderBy }],
      lang:     entry.lang,
      page:     entry.page,
      pageSize: entry.pageSize,
    },
  );
}
/** Quotes only internal test parameters for the existing psql connection. */
function literal(value: unknown): string {
  if (value == null) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return `'${String(value).replaceAll('\'', '\'\'')}'`;
}
/** Replays Drizzle's bound SQL unchanged through the direct local read-only connection. */
function inline(query: { sql: string, params: unknown[] }): string {
  return query.sql.replace(/\$(\d+)/g, (_, number) => literal(query.params[Number(number) - 1]));
}
if (process.argv[2] == null || (process.argv[2] === '--sql' && process.argv[3] == null)) {
  throw new Error(
    'Pass --sql <new-output.sql> to prepare read-only PG queries, or pass their JSONL output to verify SQLite ordering.',
  );
}
if (process.argv[2] === '--sql') {
  if (await Bun.file(process.argv[3]!).exists()) {
    throw new Error('The SQL output already exists; choose a new path.');
  }
  const db = drizzle({ connection: 'postgresql://unused@localhost/unused' });
  const projected = inline(projectedSearchQuery(db).toSQL());
  const dialect = new PgDialect();
  setHearthstoneSearchDataset({
    manifest:    { dataVersion, buildNumber: 1 },
    dataVersion,
    buildNumber: 1,
    ready:       true,
  });
  const pg = new HearthstonePgEssentialSearchAdapter();
  const queries = [
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
    'SELECT jsonb_build_object(\'kind\',\'metadata\',\'buildNumber\',max(build_number)) FROM hearthstone.patches;',
    `SELECT jsonb_build_object('kind','item','item',item) FROM (${projected}) projected WHERE item->>'lang' IN ('en','de','zhs');`,
  ];
  for (const entry of cases) {
    const sql = inline(dialect.sqlToQuery(pg.compile(request(entry), entry)));
    queries.push(
      `SELECT jsonb_build_object('kind','expected','id',${literal(entry.id)},'data',to_jsonb(expected)) FROM (${sql}) expected;`,
    );
  }
  queries.push('COMMIT;');
  await Bun.write(process.argv[3]!, queries.join('\n'));
} else {
  const lines = (await Bun.file(process.argv[2]!).text())
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  console.error(`Parsed ${lines.length} source/reference records.`);
  const manifest = {
    dataVersion,
    buildNumber: Number(lines.find(row => row.kind === 'metadata').buildNumber),
  };
  const source = snapshotRows(
    lines.filter(row => row.kind === 'item').map(row => ({ item: row.item })),
  );
  const sqlite = new Database(':memory:');
  sqlite.exec(snapshotDdl());
  sqlite.exec(
    await Bun.file(
      new URL(import.meta.resolve('@tcg-cards/db/schema/sqlite/hearthstone/search-fts.sql')),
    ).text(),
  );
  const started = performance.now();
  console.error(`Validated ${source.length} localized source rows; generating snapshot SQL.`);
  const statements = createSnapshotStatements(source, manifest);
  const sqlBytes = statements.reduce(
    (total, statement) => total + Buffer.byteLength(statement) + 1,
    0,
  );
  console.error(`Loading ${sqlBytes} bytes into SQLite.`);
  // The local verifier loads a new file atomically instead of committing every exported insert.
  sqlite.exec('BEGIN');
  for (const statement of statements) {
    sqlite.exec(statement);
  }
  sqlite.exec('COMMIT');
  const loadMs = performance.now() - started;
  console.error(`SQLite snapshot loaded in ${Math.round(loadMs)} ms.`);
  let reads = 0;
  const binding = {
    prepare(query: string) {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        async raw() {
          reads++;
          return sqlite.query(query).values(...(params as never[]));
        },
      };
    },
  } as unknown as HearthstoneSearchD1Database;
  setHearthstoneSearchDataset({ manifest, ...manifest, ready: true });
  const adapter = new HearthstoneD1EssentialSearchAdapter(async () => {
    throw new Error('Unexpected PG fallback');
  });
  const results: Array<Record<string, unknown>> = [];
  for (const entry of cases) {
    console.error(`Checking ${entry.id}.`);
    const expected = lines.find(row => row.kind === 'expected' && row.id === entry.id).data;
    const options: SearchOption = { ...entry, d1: binding };
    const result = await adapter.execute(request(entry), options);
    const actual = JSON.stringify({
      total:  result.total,
      ambit:  result.ambit,
      result: result.result,
    });
    const reference = JSON.stringify({
      total:  Number(expected.total),
      ambit:  expected.ambit,
      result: expected.result.map((item: unknown) => essentialCardSearchItem.parse(item)),
    });
    if (actual !== reference) {
      console.error(JSON.stringify({ entry, result, expected }, null, 2));
      throw new Error(`Ordering or page differs: ${entry.id}`);
    }
    results.push({
      caseId:      entry.id,
      total:       result.total,
      page:        result.page,
      resultCount: result.result.length,
      matched:     true,
    });
  }
  console.log(
    JSON.stringify(
      {
        manifest,
        rows:             source.length,
        cards:            new Set(source.map(row => row.cardId)).size,
        sqlBytes,
        loadMs,
        reads,
        remoteD1Measured: false,
        cases:            results,
      },
      null,
      2,
    ),
  );
  sqlite.close();
}
