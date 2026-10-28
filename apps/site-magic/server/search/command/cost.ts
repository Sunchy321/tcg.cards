import { ca } from '#search/server/command/adapter';

import { cost as costSchema } from '#model/magic/search/command/cost';

import { QueryError } from '#search/command/error';

import type { Column, SQL } from 'drizzle-orm';
import { and, isNotNull, isNull, not, or, sql } from 'drizzle-orm';

/** Counts one exact mana symbol in a stored cost array. */
function symbolCount(column: Column, symbol: string): SQL<number> {
  return sql<number>`COALESCE(cardinality(array_positions(${column}, ${symbol})), 0)`;
}

/** Sums all generic mana tokens stored in a cost array. */
function genericSum(column: Column): SQL<number> {
  return sql<number>`COALESCE((SELECT SUM(s::int) FROM unnest(${column}) s WHERE s ~ '^[0-9]+$'), 0)`;
}

/** Finds stored-only symbols that invalidate <= or prove strict >. */
function hasExtraSymbols(column: Column, queriedSymbols: string[]): SQL<boolean> {
  const notQueried = queriedSymbols.length === 0
    ? sql`TRUE`
    : sql`cost_symbol.symbol NOT IN (${sql.join(queriedSymbols.map(symbol => sql`${symbol}`), sql`, `)})`;

  return sql<boolean>`EXISTS (
    SELECT 1
    FROM unnest(${column}) AS cost_symbol(symbol)
    WHERE cost_symbol.symbol !~ '^[0-9]+$'
      AND ${notQueried}
  )`;
}

export const cost = ca
  .adapt(costSchema)
  .handler(({ value, operator, qualifier }, { column }) => {
    if (value.toLowerCase() === 'null') {
      switch (operator) {
      case ':':
        if (!qualifier.includes('!')) {
          return isNull(column);
        } else {
          return isNotNull(column);
        }
      default:
        throw new QueryError({
          type:    'unsupported-operator',
          payload: { op: operator, qual: qualifier, param: value },
        });
      }
    }

    const tokens = value
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

    // Unknown tokens stay distinct dimensions instead of becoming parse errors.
    const queriedSymbols = [...symbolCounts.keys()];

    /** Compares one stored symbol count with the query count. */
    const symbolCond = (symbol: string, count: number, op: '>=' | '=' | '<=' | '>' | '<'): SQL =>
      sql`${symbolCount(column, symbol)} ${sql.raw(op)} ${count}`;

    /** Compares the summed stored generic count with the query count. */
    const genericCond = (count: number, op: '>=' | '=' | '<=' | '>' | '<'): SQL =>
      sql`${genericSum(column)} ${sql.raw(op)} ${count}`;

    const atLeast = and(
      genericCond(genericCount, '>='),
      ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '>=')),
    )!;

    const atMost = and(
      genericCond(genericCount, '<='),
      ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '<=')),
      not(hasExtraSymbols(column, queriedSymbols)),
    )!;

    const exactly = and(
      genericCond(genericCount, '='),
      ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '=')),
      not(hasExtraSymbols(column, queriedSymbols)),
    )!;

    const greater = and(
      atLeast,
      or(
        genericCond(genericCount, '>'),
        ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '>')),
        hasExtraSymbols(column, queriedSymbols),
      )!,
    )!;

    const less = and(
      atMost,
      or(
        genericCond(genericCount, '<'),
        ...queriedSymbols.map(symbol => symbolCond(symbol, symbolCounts.get(symbol)!, '<')),
      )!,
    )!;

    /** Maps each search operator to its vector-order predicate. */
    const predicate = (() => {
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
    })();

    // Positive predicates exclude NULL; their SQL negation then includes it.
    const positive = and(isNotNull(column), predicate)!;
    return qualifier.includes('!') ? not(positive) : positive;
  });
