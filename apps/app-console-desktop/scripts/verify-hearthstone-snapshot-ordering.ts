import { Database } from 'bun:sqlite';
import { createDb } from '@tcg-cards/db';
import { snapshotRows, createSnapshotStatements, hearthstoneSearchFtsSql } from '../electron/runtime/lib/search-publication/snapshot';
import { hearthstoneSnapshotDdl } from './lib/search-database-ddl';

/**
 * Checks that the Hearthstone snapshot preserves PostgreSQL ordering. Phase
 * `--sql` prints the read-only PostgreSQL queries for every ordering case;
 * feeding the resulting JSONL back verifies the same ordering on the generated
 * SQLite snapshot. No website code is involved: the site adapter's own query
 * behaviour is covered by its unit tests, while this script covers the data the
 * publisher writes.
 */

const dataVersion = 'snapshot-ordering';

/** One ordering case compared on both databases. */
type OrderingCase = { id: string, orderBy: string, lang: string };

const fields = ['name', 'id', 'set', 'cost', 'attack', 'health', 'stats', 'type', 'class'] as const;

const cases: OrderingCase[] = [
  ...fields.flatMap(field => ['+', '-'].map(direction => ({
    id:      `${field}${direction}`,
    orderBy: `${field}${direction}`,
    lang:    'en',
  }))),
  { id: 'zh-name', orderBy: 'name+', lang: 'zhs' },
  { id: 'de-name', orderBy: 'name-', lang: 'de' },
];

/** Maps one order field to its PostgreSQL expression for the selected language. */
function pgExpression(field: string, lang: string): string {
  switch (field) {
  case 'name': return `(SELECT name FROM hearthstone.search_card_localizations l WHERE l.card_id = c.card_id AND l.lang = '${lang}')`;
  case 'id': return 'c.card_id';
  case 'set': return 'c."set"';
  case 'cost': return 'c.cost::text';
  case 'attack': return 'c.attack::text';
  case 'health': return 'c.health::text';
  case 'stats': return 'c.attack::text || \'/\' || c.health::text';
  case 'type': return 'c.type';
  case 'class': return 'c.class_count::text';
  default: throw new Error(`Unsupported order field: ${field}`);
  }
}

/** Maps one order field to the snapshot column that carries its PostgreSQL rank or value. */
function sqliteExpression(field: string, lang: string): string {
  switch (field) {
  case 'name': return `(SELECT name_order FROM hearthstone_search_card_localizations l WHERE l.card_id = c.card_id AND l.lang = '${lang}')`;
  case 'id': return 'c.id_order';
  case 'set': return 'c.set_order';
  case 'cost': return 'c.cost';
  case 'attack': return 'c.attack';
  case 'health': return 'c.health';
  case 'stats': return 'c.attack';
  case 'type': return 'c.type';
  case 'class': return 'c.class_count';
  default: throw new Error(`Unsupported order field: ${field}`);
  }
}

/** Splits `field+direction` into its two parts. */
function splitOrder(orderBy: string): { field: string, direction: 'asc' | 'desc' } {
  return { field: orderBy.slice(0, -1), direction: orderBy.endsWith('-') ? 'desc' : 'asc' };
}

/** Builds the read-only PostgreSQL query that lists one ordering case. */
function pgQuery(entry: OrderingCase): string {
  const { field, direction } = splitOrder(entry.orderBy);
  const expression = pgExpression(field, entry.lang);
  const clauses = field === 'stats' ? [`c.attack ${direction} NULLS LAST`, `c.health ${direction} NULLS LAST`] : [`${expression} ${direction} NULLS LAST`];
  return `SELECT jsonb_build_object('kind','case','id','${entry.id}','cards',jsonb_agg(c.card_id ORDER BY ${clauses.join(', ')}, c.card_id)) AS record
    FROM hearthstone.search_cards c
    WHERE c.deleted_at IS NULL`;
}

if (process.argv[2] == null || (process.argv[2] === '--sql' && process.argv[3] == null)) {
  throw new Error(
    'Pass --sql <new-output.sql> to prepare read-only PG queries, or pass their JSONL output to verify snapshot ordering.',
  );
}

if (process.argv[2] === '--sql') {
  if (await Bun.file(process.argv[3]!).exists()) {
    throw new Error('The SQL output already exists; choose a new path.');
  }
  const queries = [
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
    ...cases.map(entry => `${pgQuery(entry)};`),
    'COMMIT;',
  ];
  await Bun.write(process.argv[3]!, queries.join('\n'));
  console.error(`Prepared ${cases.length} ordering queries.`);
} else {
  const records = (await Bun.file(process.argv[2]!).text())
    .trim()
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line) as { kind: string, id: string, cards: string[] });
  const expected = new Map(records.map(record => [record.id, record.cards]));
  console.error(`Parsed ${expected.size} PostgreSQL ordering references.`);

  const connection = process.env.DATABASE_URL ?? process.env.DESKTOP_LOCAL_DATABASE_URL;
  if (connection == null) throw new Error('Set DATABASE_URL to read the source projection.');
  const database = createDb(connection);
  const snapshot = createDatabase(await hearthstoneSnapshotDdl(), await hearthstoneSearchFtsSql());
  try {
    // The verification needs real projection rows; the publisher task reads the
    // same rows through its own projection query.
    const source = await readProjection(database);
    for (const statement of createSnapshotStatements(source, { dataVersion, buildNumber: 1 })) {
      snapshot.exec(statement);
    }

    const results: Array<Record<string, unknown>> = [];
    for (const entry of cases) {
      const reference = expected.get(entry.id);
      if (reference == null) throw new Error(`The PostgreSQL reference is missing case ${entry.id}.`);
      const actual = orderedCardIds(snapshot, entry);
      if (JSON.stringify(actual) !== JSON.stringify(reference)) {
        const firstDifference = actual.findIndex((value, index) => value !== reference[index]);
        throw new Error(
          `Ordering differs for ${entry.id} at position ${firstDifference}: snapshot ${actual[firstDifference]}, PostgreSQL ${reference[firstDifference]}.`,
        );
      }
      results.push({ caseId: entry.id, compared: actual.length, matched: true });
    }
    console.log(JSON.stringify({ dataVersion, cases: results }, null, 2));
  } finally {
    snapshot.close();
    await database.$client.end({ timeout: 0 });
  }
}

/** Creates the in-memory snapshot database with its schema and FTS index. */
function createDatabase(ddl: string, fts: string): Database {
  const database = new Database(':memory:');
  database.exec(ddl);
  database.exec(fts);
  return database;
}

/** Reads the latest projection rows the snapshot is built from. */
async function readProjection(database: ReturnType<typeof createDb>) {
  const { projectedSearchQuery } = await import('../electron/runtime/lib/search-publication/snapshot/hearthstone-d1-source');
  return snapshotRows(await projectedSearchQuery(database));
}

/** Lists one case's card identities in the snapshot's stored order. */
function orderedCardIds(database: Database, entry: OrderingCase): string[] {
  const { field, direction } = splitOrder(entry.orderBy);
  const clauses = field === 'stats'
    ? [`c.attack ${direction}`, `c.health ${direction}`]
    : [`${sqliteExpression(field, entry.lang)} ${direction}`];
  const rows = database
    .query(`SELECT c.card_id AS cardId FROM hearthstone_search_cards c ORDER BY ${clauses.join(', ')}, c.card_id`)
    .all() as Array<{ cardId: string }>;
  return rows.map(row => row.cardId);
}
