import { QueryError } from '#search/command/error';

import type { SQL } from 'drizzle-orm';
import { and, not, or, sql } from 'drizzle-orm';

/**
 * The mana-cost vector order shared by every backend. A query term is a
 * summed generic count plus per-symbol counts; a stored cost is compared
 * dimension by dimension through `CostDimensions`, so PostgreSQL arrays, the
 * PostgreSQL dictionary, and the SQLite dictionary all evaluate the same
 * predicate shape and agree on strict partial order, exact equality, unknown
 * symbols as virtual dimensions, and the logical complement of `!`.
 */

export type ComparisonOperator = '>=' | '=' | '<=' | '>' | '<';

/** SQL access to the dimensions of one stored cost. */
export type CostDimensions = {
  /** Count of one exact non-generic symbol. */
  symbolCount:     (symbol: string) => SQL<number>;
  /** Sum of every generic token. */
  genericSum:      () => SQL<number>;
  /** Whether any stored non-generic symbol lies outside the queried symbols. */
  hasExtraSymbols: (queriedSymbols: string[]) => SQL<boolean>;
};

/** A query term split into its summed generic count and per-symbol counts. */
export type ParsedCostTerm = {
  genericCount: number;
  symbolCounts: Map<string, number>;
};

/** Splits one query term into its summed generic count and per-symbol counts. */
export function parseCostTerm(term: string): ParsedCostTerm {
  const tokens = term
    .toUpperCase()
    .split(/\{([^{}]*)\}|(\d{2,})|(H[WR1])|(.(?:\/.)?)/)
    .filter(token => token !== '' && token != null);
  const symbolCounts = new Map<string, number>();
  let genericCount = 0;

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      genericCount += Number.parseInt(token, 10);
    } else {
      symbolCounts.set(token, (symbolCounts.get(token) ?? 0) + 1);
    }
  }

  return { genericCount, symbolCounts };
}

/** Builds the vector-order predicate of one parsed term over the given dimensions. */
export function costComparison(
  dimensions: CostDimensions,
  operator: string,
  { genericCount, symbolCounts }: ParsedCostTerm,
): SQL {
  // Unknown tokens stay distinct dimensions instead of becoming parse errors.
  const queriedSymbols = [...symbolCounts.keys()];

  /** Compares one stored symbol count with the query count. */
  const symbolCond = (symbol: string, count: number, op: ComparisonOperator): SQL =>
    sql`${dimensions.symbolCount(symbol)} ${sql.raw(op)} ${count}`;

  /** Compares the summed stored generic count with the query count. */
  const genericCond = (count: number, op: ComparisonOperator): SQL =>
    sql`${dimensions.genericSum()} ${sql.raw(op)} ${count}`;

  const atLeast = and(
    genericCond(genericCount, '>='),
    ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '>=')),
  )!;

  const atMost = and(
    genericCond(genericCount, '<='),
    ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '<=')),
    not(dimensions.hasExtraSymbols(queriedSymbols)),
  )!;

  const exactly = and(
    genericCond(genericCount, '='),
    ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '=')),
    not(dimensions.hasExtraSymbols(queriedSymbols)),
  )!;

  const greater = and(
    atLeast,
    or(
      genericCond(genericCount, '>'),
      ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '>')),
      dimensions.hasExtraSymbols(queriedSymbols),
    )!,
  )!;

  const less = and(
    atMost,
    or(
      genericCond(genericCount, '<'),
      ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '<')),
    )!,
  )!;

  switch (operator) {
  case ':':
  case '>=':
    return atLeast;
  case '=':
    return exactly;
  case '>':
    return greater;
  case '<=':
    return atMost;
  case '<':
    return less;
  default:
    throw new QueryError({ type: 'invalid-query' });
  }
}
