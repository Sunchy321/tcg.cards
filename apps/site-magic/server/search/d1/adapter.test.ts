import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PgDialect } from 'drizzle-orm/pg-core';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { runWithDb } from '@tcg-cards/db/db';
import * as schema from '@tcg-cards/db/schema/sqlite/magic';
import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import type { CommonServerCommand } from '#search/server/command';
import * as commands from '../command-list';
import { setMagicSearchManifest } from '../accelerated-adapter';
import { MagicD1SearchAdapter } from './adapter';
import type { MagicSearchD1Database } from './types';

let sqlite: Database;
const adapter = new MagicD1SearchAdapter();
let reads = 0;

/** Resolves actual Magic DSL with card grouping and stable test ordering. */
function request(dsl: string) {
  return resolveQueryRequest(simplify(new Parser(dsl).parse()), Object.values(commands) as CommonServerCommand[], {
    group: 'card', sort: [{ kind: 'request', field: 'order', value: 'id+' }], lang: 'en', page: 1, pageSize: 1,
  });
}

/** Runs the production Drizzle D1 statements directly on SQLite. */
function binding(): MagicSearchD1Database {
  return {
    prepare(query: string) {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        async raw() {
          reads++;
          return sqlite.query(query).values(...params as never[]);
        },
        async all() {
          reads++;
          return { results: sqlite.query(query).all(...params as never[]) };
        },
      };
    },
  } as unknown as MagicSearchD1Database;
}

/** Loads card, two text sources, and a display candidate independently of the query compiler. */
function card(id: string, original: string, localized: string, ambit = 'primary'): void {
  sqlite.query('INSERT INTO magic_search_cards VALUES (?, ?, ?, ?)').run(id, '', ambit, 1);
  sqlite.query('INSERT INTO magic_search_card_parts (card_id, version, part_index, name, typeline) VALUES (?, ?, 0, ?, ?)').run(id, '', id, 'Creature');
  sqlite.query('INSERT INTO magic_search_card_part_localizations VALUES (?, ?, ?, ?, 0, ?, NULL, ?)').run(id, '', 'en', '', id, 'Creature');
  sqlite.query('INSERT INTO magic_search_candidates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, '', 'en', 'lea', '1', 'en', 'scryfall', '1993-08-05', 'normal', 'webp', 'highres_scan');
  sqlite.query('INSERT INTO magic_search_text_rows (kind,card_id,version,part_index,locale,source,body) VALUES (\'part\', ?, \'\', 0, NULL, NULL, ?)').run(id, original);
  sqlite.query('INSERT INTO magic_search_text_rows (kind,card_id,version,part_index,locale,source,body) VALUES (\'localization\', ?, \'\', 0, \'en\', \'\', ?)').run(id, localized);
}

/** Executes the public compact result path, including candidate verification when needed. */
function search(dsl: string, page = 1) {
  return adapter.executeEssential(request(dsl), { dsl, page, pageSize: 1, lang: 'en', groupBy: 'card', orderBy: 'id+', d1: binding() });
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  // Derive column declarations from the exported schema; these tests exercise reads, not constraints.
  for (const table of Object.values(schema)) {
    const config = getTableConfig(table);
    sqlite.exec(`CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`).join(', ')})`);
  }
  sqlite.exec('INSERT INTO magic_search_meta VALUES (\'data_version\', \'test\')');
  setMagicSearchManifest({ dataVersion: 'test', typeSymbols: [], tagOwners: {} });
  reads = 0;
});
afterEach(() => {
  sqlite.close();
  setMagicSearchManifest(null);
});

describe('Magic regex routing', () => {
  test('matches each body independently and retains exact negation and empty-page totals', async () => {
    card('A', 'Draw a card.', 'Other');
    card('B', 'Other', 'Discard a card.');
    expect((await search('text:/draw|discard/')).total).toBe(2);
    expect((await search('text:/D/')).total).toBe(2);
    expect((await search('text!:/draw/')).result.map(item => item.cardId)).toEqual(['B']);
    expect((await search('name!:A text:/card/')).result.map(item => item.cardId)).toEqual(['B']);
    const empty = await search('text:/draw|discard/', 99);
    expect(empty.result).toEqual([]);
    expect(empty.total).toBe(2);
  });

  test('does not combine body sources or select an ambit before original PG verification', async () => {
    card('A', 'card before draw', 'Other');
    card('B', 'draw a card', 'Other', 'additional');
    card('C', 'draw', 'card');
    let pgReads = 0;
    const pg = drizzle({ connection: 'postgres://localhost/unused' });
    const execute = async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
      pgReads++;
      const compiled = new PgDialect().sqlToQuery(query);
      expect(compiled.params).toContain('["A","B"]');
      expect(compiled.params).toContain('draw.*card');
      return [{ total: pgReads === 1 ? 0 : 1, candidates: [] }] as never;
    };
    Object.assign(pg, { execute });
    const result = await runWithDb(pg, () => search('text:/draw.*card/'));
    expect(adapter.plan(request('text:/draw.*card/')).type).toBe('candidate');
    expect(result.total).toBe(1);
    expect(pgReads).toBe(2); // Empty primary exact results are widened only by the PG path.
    expect(reads).toBe(1);
    pgReads = 0;
    Object.assign(pg, { execute: async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
      const compiled = new PgDialect().sqlToQuery(query);
      expect(compiled.params).toContain('["B"]');
      return [{ total: 1, candidates: [] }];
    } });
    await runWithDb(pg, () => search('name!:A text:/draw.*card/'));
  });

  test('keeps unsafe regex polarity and branches on original PG', () => {
    for (const dsl of ['-text:/draw.*card/', 'text:/draw.*card/ | text:/[a-z]+/', 'text:/\\bdraw/']) {
      expect(adapter.plan(request(dsl)).type).toBe('original');
    }
  });
});

test('preserves original and localized name modifiers in positive and negative regexes', async () => {
  card('A', 'Other', 'Other');
  card('B', 'Other', 'Other');
  sqlite.exec('UPDATE magic_search_card_parts SET name = \'Foo\' WHERE card_id = \'A\'');
  sqlite.exec('UPDATE magic_search_card_part_localizations SET name = \'Foo\' WHERE card_id = \'B\'');
  expect((await search('on:/Foo/')).result.map(item => item.cardId)).toEqual(['A']);
  expect((await search('ln:/Foo/')).result.map(item => item.cardId)).toEqual(['B']);
  expect((await search('name.oracle!:/Foo/')).result.map(item => item.cardId)).toEqual(['B']);
  expect((await search('name.localized!:/Foo/')).result.map(item => item.cardId)).toEqual(['A']);
  const empty = { ...request('name:/Foo/'), filter: null };
  expect(adapter.plan({ ...empty, result: { ...empty.result, group: 'print' } }).type).toBe('original');
});

test('falls back without a candidate restriction when Magic evidence is stale or non-ASCII', async () => {
  card('A', 'draw a card', 'Other');
  const pg = drizzle({ connection: 'postgres://localhost/unused' });
  const execute = async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
    const compiled = new PgDialect().sqlToQuery(query);
    expect(compiled.sql).not.toContain('jsonb_array_elements_text');
    return [{ total: 9, candidates: [] }];
  };
  Object.assign(pg, { execute });
  sqlite.exec('UPDATE magic_search_meta SET value = \'old\' WHERE key = \'data_version\'');
  expect((await runWithDb(pg, () => search('text:/draw.*card/'))).total).toBe(9);
  sqlite.exec('UPDATE magic_search_meta SET value = \'test\' WHERE key = \'data_version\'');
  sqlite.exec('UPDATE magic_search_text_rows SET body = \'draw K card\' WHERE kind = \'part\'');
  expect((await runWithDb(pg, () => search('text:/draw.*card/'))).total).toBe(9);
  expect((await runWithDb(pg, () => search('text:/draw/'))).total).toBe(9);
});
