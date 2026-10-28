import { afterAll, describe, expect, test } from 'bun:test';

import { sql } from 'drizzle-orm';
import { PgDialect, doublePrecision, pgTable, text } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

import { cost } from './cost';

/** Describes one cost row for PostgreSQL result assertions. */
type CostFixture = {
  id:        string;
  cost:      string[] | null;
  manaValue: number | null;
};

const costCases = pgTable('cost_cases', {
  id:        text('id'),
  cost:      text('cost').array(),
  manaValue: doublePrecision('mana_value'),
});

const fixtures: CostFixture[] = [
  { id: 'half', cost: ['H1'], manaValue: 0.5 },
  { id: 'hybrid', cost: ['W/U/P'], manaValue: 1 },
  { id: 'legacy', cost: ['2', 'C', 'C', 'C', '2'], manaValue: 7 },
  { id: 'null', cost: null, manaValue: null },
  { id: 'three-w', cost: ['3', 'W'], manaValue: 4 },
  { id: 'u', cost: ['U'], manaValue: 1 },
  { id: 'w', cost: ['W'], manaValue: 1 },
  { id: 'wu', cost: ['W', 'U'], manaValue: 2 },
  { id: 'ww', cost: ['W', 'W'], manaValue: 2 },
  { id: 'wx', cost: ['W', 'X'], manaValue: 1 },
  { id: 'zero', cost: ['0'], manaValue: 0 },
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

/** Builds the adapter predicate for one mana-cost expression. */
function predicate(value: string, operator: ':' | '=' | '<' | '<=' | '>' | '>=', qualifier: string[] = []) {
  return cost.call({
    args:   { value, operator, qualifier } as any,
    column: () => costCases.cost,
    ctx:    { meta: {}, table: costCases } as any,
  });
}

/** Runs a cost predicate against inline rows in a read-only PostgreSQL transaction. */
async function matchingIds(value: string, operator: ':' | '=' | '<' | '<=' | '>' | '>=', qualifier: string[] = []) {
  if (client == null) {
    throw new Error('A local PostgreSQL connection is required for cost result assertions.');
  }

  const values = sql.join(fixtures.map(fixture => {
    const costValue = fixture.cost == null
      ? sql`NULL::text[]`
      : sql`ARRAY[${sql.join(fixture.cost.map(symbol => sql`${symbol}`), sql`, `)}]::text[]`;
    const manaValue = fixture.manaValue == null
      ? sql`NULL::double precision`
      : sql`${fixture.manaValue}::double precision`;

    return sql`(${fixture.id}::text, ${costValue}, ${manaValue})`;
  }), sql`, `);

  const query = sql`
    WITH cost_cases(id, cost, mana_value) AS (VALUES ${values})
    SELECT id FROM cost_cases
    WHERE ${predicate(value, operator, qualifier)}
    ORDER BY id
  `;
  const compiled = dialect.sqlToQuery(query);
  const rows = await client.begin(async transaction => {
    await transaction.unsafe('SET TRANSACTION READ ONLY');
    return transaction.unsafe(compiled.sql, compiled.params as any[]);
  });

  return rows.map(row => String(row.id));
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
});
