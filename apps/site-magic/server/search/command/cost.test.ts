import { afterAll, describe, expect, test } from 'bun:test';

import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { PgDialect, doublePrecision, integer, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

import { costDictionaryColumnsSql, costTokensSql } from '@tcg-cards/db/search-cost';
import { searchCostFixedSymbols } from '@tcg-cards/db/schema/shared/magic/search';

import { cost } from './cost';

/** Describes one cost row for PostgreSQL result assertions; `cost` is the stored braced text. */
type CostFixture = {
  id:        string;
  cost:      string | null;
  manaValue: number | null;
};

const costCases = pgTable('cost_cases', {
  id:        text('id'),
  cost:      text('cost'),
  manaValue: doublePrecision('mana_value'),
});

/** Part rows carrying the braced cost text, as `search_card_parts` does. */
const partCases = pgTable('part_cases', {
  id:   text('id'),
  cost: text('cost'),
});

/** A CTE-backed stand-in for `magic.search_costs` with the same column names. */
const dictionaryCases = pgTable('search_costs', {
  cost:      text('cost'),
  generic:   integer('generic'),
  w:         smallint('w'),
  u:         smallint('u'),
  b:         smallint('b'),
  r:         smallint('r'),
  g:         smallint('g'),
  x:         smallint('x'),
  c:         smallint('c'),
  specials:  text('specials').array(),
  deletedAt: timestamp('deleted_at'),
});

const fixtures: CostFixture[] = [
  { id: 'half', cost: '{H1}', manaValue: 0.5 },
  { id: 'hybrid', cost: '{W/U/P}', manaValue: 1 },
  { id: 'legacy', cost: '{2}{C}{C}{C}{2}', manaValue: 7 },
  { id: 'null', cost: null, manaValue: null },
  { id: 'three-w', cost: '{3}{W}', manaValue: 4 },
  { id: 'u', cost: '{U}', manaValue: 1 },
  { id: 'w', cost: '{W}', manaValue: 1 },
  { id: 'wu', cost: '{W}{U}', manaValue: 2 },
  { id: 'ww', cost: '{W}{W}', manaValue: 2 },
  { id: 'wx', cost: '{W}{X}', manaValue: 1 },
  { id: 'zero', cost: '{0}', manaValue: 0 },
];

/**
 * Extra rows for the dictionary path: a repeated special symbol, the merged
 * form of the legacy cost (a separate key with identical comparison columns),
 * a rare stored token outside every fixed column, and malformed text that
 * both tokenizers must keep as one opaque token.
 */
const dictionaryFixtures: CostFixture[] = [
  ...fixtures,
  { id: 'gw-twice', cost: '{1}{G/W}{G/W}', manaValue: 3 },
  { id: 'four-ccc', cost: '{4}{C}{C}{C}', manaValue: 7 },
  { id: 'rare', cost: '{2}{R}{D}', manaValue: 3 },
  { id: 'malformed', cost: '2R', manaValue: 3 },
];

const connectionString = process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;
const client = connectionString ? postgres(connectionString) : null;
const dialect = new PgDialect();
const describePostgres = client == null ? describe.skip : describe;

afterAll(async () => {
  if (client != null) {
    await client.end();
  }
});

type Operator = ':' | '=' | '<' | '<=' | '>' | '>=';

/** Builds the adapter predicate for one mana-cost expression over the token array. */
function predicate(value: string, operator: Operator, qualifier: string[] = []) {
  return cost.call({
    args:   { value, operator, qualifier, argType: 'id' } as any,
    column: () => costCases.cost,
    ctx:    { meta: {}, table: costCases } as any,
  });
}

/** Builds the adapter predicate for one mana-cost expression over the dictionary key. */
function dictionaryPredicate(value: string, operator: Operator, qualifier: string[] = []) {
  return cost.call({
    args:   { value, operator, qualifier, argType: 'id' } as any,
    column: () => partCases.cost,
    ctx:    { meta: {}, table: { searchAcceleration: {}, costDictionary: dictionaryCases } } as any,
  });
}

/** Inline `VALUES` rows of the given fixtures. */
function fixtureValues(rows: CostFixture[]): SQL {
  return sql.join(rows.map(fixture => {
    const costValue = fixture.cost == null
      ? sql`NULL::text`
      : sql`${fixture.cost}::text`;
    const manaValue = fixture.manaValue == null
      ? sql`NULL::double precision`
      : sql`${fixture.manaValue}::double precision`;

    return sql`(${fixture.id}::text, ${costValue}, ${manaValue})`;
  }), sql`, `);
}

/** Runs one read-only query and returns its ordered ids. */
async function queryIds(query: SQL): Promise<string[]> {
  if (client == null) {
    throw new Error('A local PostgreSQL connection is required for cost result assertions.');
  }

  const compiled = dialect.sqlToQuery(query);
  const rows = await client.begin(async transaction => {
    await transaction.unsafe('SET TRANSACTION READ ONLY');
    return transaction.unsafe(compiled.sql, compiled.params as any[]);
  });

  return rows.map(row => String(row.id));
}

/** Runs a cost predicate against inline token-array rows. */
async function matchingIds(value: string, operator: Operator, qualifier: string[] = [], rows = fixtures) {
  return queryIds(sql`
    WITH cost_cases(id, cost, mana_value) AS (VALUES ${fixtureValues(rows)})
    SELECT id FROM cost_cases
    WHERE ${predicate(value, operator, qualifier)}
    ORDER BY id
  `);
}

/**
 * Runs a cost predicate through the dictionary path: the inline rows are
 * projected into a dictionary keyed by the stored text, with comparison
 * columns derived by the same tokenizer the desktop rebuild uses, then the
 * accelerated predicate filters the key column. The CTE column list follows
 * the fixed-symbol order the helper emits.
 */
async function dictionaryMatchingIds(value: string, operator: Operator, qualifier: string[] = [], rows = dictionaryFixtures) {
  const fixedColumns = sql.join(searchCostFixedSymbols.map(symbol => sql.raw(symbol.toLowerCase())), sql`, `);

  return queryIds(sql`
    WITH cost_cases(id, cost, mana_value) AS (VALUES ${fixtureValues(rows)}),
    tokenized AS (
      SELECT d.cost, ${costTokensSql(sql`d.cost`)} AS tokens
      FROM (SELECT DISTINCT cost FROM cost_cases WHERE cost IS NOT NULL) d
    ),
    search_costs(cost, generic, ${fixedColumns}, specials, deleted_at) AS (
      SELECT cost, ${costDictionaryColumnsSql(sql`tokens`)}, NULL::timestamp
      FROM tokenized
    ),
    part_cases(id, cost) AS (
      SELECT id, cost FROM cost_cases
    )
    SELECT id FROM part_cases
    WHERE ${dictionaryPredicate(value, operator, qualifier)}
    ORDER BY id
  `);
}

describePostgres('mana cost PostgreSQL results', () => {
  test('uses every symbol dimension for strict comparison', async () => {
    expect(await matchingIds('W', '>')).toEqual(['three-w', 'wu', 'ww', 'wx']);
  });

  test('requires every symbol dimension to match for equality', async () => {
    expect(await matchingIds('W', '=')).toEqual(['w']);
    expect(await matchingIds('WW', '=')).toEqual(['ww']);
    expect(await matchingIds('H1', '=')).toEqual(['half']);
    expect(await matchingIds('{W/U/P}', '=')).toEqual(['hybrid']);
    expect(await matchingIds('W', '=', ['!'])).toEqual(['half', 'hybrid', 'legacy', 'null', 'three-w', 'u', 'wu', 'ww', 'wx', 'zero']);
  });

  test('sums multiple numeric input tokens', async () => {
    expect(await matchingIds('{1}{2}{W}', '=')).toEqual(['three-w']);
    expect(await matchingIds('4CCC', '=')).toEqual(['legacy']);
  });

  test('compares generic counts and repeated symbols strictly', async () => {
    expect(await matchingIds('{2}{W}', '>')).toEqual(['three-w']);
    expect(await matchingIds('{3}{W}', '>=')).toEqual(['three-w']);
    expect(await matchingIds('{3}{W}', '<=')).toEqual(['three-w', 'w', 'zero']);
  });

  test('treats an unknown symbol as a virtual dimension', async () => {
    expect(await matchingIds('V', '>')).toEqual([]);
    expect(await matchingIds('WV', '<')).toEqual(['w', 'zero']);
    expect(await matchingIds('W', '<')).toEqual(['zero']);
  });

  test('uses logical complements for incomparable and NULL costs', async () => {
    expect(await matchingIds('W', '>', ['!'])).toEqual(['half', 'hybrid', 'legacy', 'null', 'u', 'w', 'zero']);
    expect(await matchingIds('null', ':')).toEqual(['null']);
    expect(await matchingIds('null', ':', ['!'])).toEqual(['half', 'hybrid', 'legacy', 'three-w', 'u', 'w', 'wu', 'ww', 'wx', 'zero']);
  });

  test('splits bare | into or and bare & into and across cost expressions', async () => {
    expect(await matchingIds('{W}|{U}', ':')).toEqual(['three-w', 'u', 'w', 'wu', 'ww', 'wx']);
    expect(await matchingIds('{W}&{U}', ':')).toEqual(['wu']);
    expect(await matchingIds('{W}|{U}', ':', ['!'])).toEqual(['half', 'hybrid', 'legacy', 'null', 'zero']);
  });
});

describePostgres('mana cost dictionary PostgreSQL results', () => {
  /** Every expression the token-array baseline asserts, plus dictionary-specific symbol mixes. */
  const expressions: Array<[string, Operator, string[]?]> = [
    ['W', '>'],
    ['W', '='],
    ['WW', '='],
    ['H1', '='],
    ['{W/U/P}', '='],
    ['W', '=', ['!']],
    ['{1}{2}{W}', '='],
    ['4CCC', '='],
    ['{2}{W}', '>'],
    ['{3}{W}', '>='],
    ['{3}{W}', '<='],
    ['V', '>'],
    ['WV', '<'],
    ['W', '<'],
    ['W', '>', ['!']],
    ['null', ':'],
    ['null', ':', ['!']],
    ['{W}|{U}', ':'],
    ['{W}&{U}', ':'],
    ['{W}|{U}', ':', ['!']],
    ['{G/W}', ':'],
    ['{G/W}{G/W}', '='],
    ['{1}{G/W}', '<'],
    ['{G/W}', '>'],
    ['{2}{R}', '>'],
    ['{2}{R}{D}', '='],
    ['{2}{R}', '<=', ['!']],
    ['C', ':'],
    ['{4}{C}{C}{C}', '<'],
    ['X', '>='],
    ['{2R}', '='],
    ['{2}{R}', '>='],
  ];

  test('matches the token-array baseline for every expression', async () => {
    for (const [value, operator, qualifier] of expressions) {
      const expected = await matchingIds(value, operator, qualifier ?? [], dictionaryFixtures);
      expect(await dictionaryMatchingIds(value, operator, qualifier ?? [])).toEqual(expected);
    }
  });

  test('keeps the braced key distinct while comparing merged generic tokens', async () => {
    // `{2}{C}{C}{C}{2}` and `{4}{C}{C}{C}` are two dictionary rows that compare alike.
    expect(await dictionaryMatchingIds('4CCC', '=')).toEqual(['four-ccc', 'legacy']);
    expect(await dictionaryMatchingIds('{2}{C}{C}{C}{2}', '=')).toEqual(['four-ccc', 'legacy']);
    expect(await dictionaryMatchingIds('{3}{C}{C}{C}', '>')).toEqual(['four-ccc', 'legacy']);
  });

  test('counts repeated specials and treats rare stored tokens as dimensions', async () => {
    expect(await dictionaryMatchingIds('{G/W}', ':')).toEqual(['gw-twice']);
    expect(await dictionaryMatchingIds('{1}{G/W}', '=')).toEqual([]);
    expect(await dictionaryMatchingIds('{1}{G/W}{G/W}', '=')).toEqual(['gw-twice']);
    expect(await dictionaryMatchingIds('{2}{R}', '=')).toEqual([]);
    expect(await dictionaryMatchingIds('{2}{R}', '>')).toEqual(['rare']);
    expect(await dictionaryMatchingIds('{2}{R}{D}', '=')).toEqual(['rare']);
  });

  test('keeps malformed stored text as one opaque token on both paths', async () => {
    // `2R` is not braced, so it is a single symbol `2R`: neither generic 2 nor R.
    expect(await matchingIds('{2R}', '=', [], dictionaryFixtures)).toEqual(['malformed']);
    expect(await dictionaryMatchingIds('{2R}', '=')).toEqual(['malformed']);
    expect(await dictionaryMatchingIds('{2}{R}', '>=')).not.toContain('malformed');
  });

  test('keeps NULL costs incomparable through the key column', async () => {
    expect(await dictionaryMatchingIds('null', ':')).toEqual(['null']);
    expect(await dictionaryMatchingIds('W', '>=')).not.toContain('null');
    expect(await dictionaryMatchingIds('W', '>=', ['!'])).toContain('null');
  });
});
