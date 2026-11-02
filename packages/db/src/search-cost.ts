import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { searchCostFixedSymbols } from './schema/shared/magic/search';

/**
 * Tokens of one stored cost text. Well-formed braced text (`{2}{W}`) yields
 * its brace contents in order; any other non-NULL text is kept whole as a
 * single token, matching the TypeScript tokenizer so the original query path
 * and the dictionary read identical dimensions from the same value. NULL stays
 * NULL.
 */
export function costTokensSql(column: SQL): SQL {
  // Once the braced form is confirmed, trimming the outer braces and splitting
  // on `}{` yields the tokens in order far cheaper than a regexp scan; tokens
  // never contain braces, so the split cannot mis-cut. Bracket expressions
  // spell the braces so no backslash escaping is needed.
  return sql`CASE
    WHEN ${column} IS NULL THEN NULL
    WHEN ${column} ~ '^([{][^{}]+[}])*$' THEN string_to_array(btrim(${column}, '{}'), '}{')
    ELSE ARRAY[${column}]
  END`;
}

/** Occurrences of one exact symbol in a token array. */
export function costSymbolCountSql(tokens: SQL, symbol: string): SQL {
  return sql`cardinality(array_positions(${tokens}, ${symbol}))`;
}

/**
 * The comparison columns of one dictionary row derived from a token array, in
 * `search_costs` column order: `generic`, the fixed symbol counts, then
 * `specials`. They encode the public cost handler's reading of the tokens —
 * generic tokens sum, every other token is counted — so the desktop rebuild
 * and result tests derive rows from the same expressions.
 */
export function costDictionaryColumnsSql(tokens: SQL): SQL {
  const fixed = sql.join(searchCostFixedSymbols.map(symbol => sql`${symbol}`), sql`, `);

  return sql`
    COALESCE((SELECT SUM(t::int) FROM unnest(${tokens}) t WHERE t ~ '^[0-9]+$'), 0),
    ${sql.join(searchCostFixedSymbols.map(symbol => costSymbolCountSql(tokens, symbol)), sql`, `)},
    ARRAY(
      SELECT t
      FROM unnest(${tokens}) WITH ORDINALITY AS s(t, i)
      WHERE t !~ '^[0-9]+$' AND t NOT IN (${fixed})
      ORDER BY i
    )`;
}
