import { ca } from '#search/server/command/adapter';

import { cost as costSchema } from '#model/magic/search/command/cost';

import { QueryError } from '#search/command/error';

import type { Column, SQL } from 'drizzle-orm';
import { and, isNotNull, isNull, not, or, sql } from 'drizzle-orm';

import type { SearchCost } from '#schema/shared/magic/search';
import { searchCostFixedSymbols } from '#schema/shared/magic/search';
import { costTokensSql } from '@tcg-cards/db/search-cost';

import { matchValueGroups, splitValueGroups } from '#search/server/command/terms';

import type { CostDimensions, ParsedCostTerm } from './cost-order';
import { costComparison, parseCostTerm } from './cost-order';

/** The `search_costs` dictionary, or a stand-in table exposing the same columns. */
type CostDictionary = typeof SearchCost;

/** Dimensions read from a `text[]` token expression. */
function arrayDimensions(tokens: SQL): CostDimensions {
  return {
    symbolCount: symbol =>
      sql<number>`COALESCE(cardinality(array_positions(${tokens}, ${symbol})), 0)`,
    genericSum: () =>
      sql<number>`COALESCE((SELECT SUM(s::int) FROM unnest(${tokens}) s WHERE s ~ '^[0-9]+$'), 0)`,
    hasExtraSymbols: queriedSymbols => {
      const notQueried = queriedSymbols.length === 0
        ? sql`TRUE`
        : sql`cost_symbol.symbol NOT IN (${sql.join(queriedSymbols.map(symbol => sql`${symbol}`), sql`, `)})`;

      return sql<boolean>`EXISTS (
        SELECT 1
        FROM unnest(${tokens}) AS cost_symbol(symbol)
        WHERE cost_symbol.symbol !~ '^[0-9]+$'
          AND ${notQueried}
      )`;
    },
  };
}

/**
 * One predicate over the braced text of the domain cost column. The text is
 * tokenized once per row inside a derived table; `OFFSET 0` keeps the planner
 * from flattening it, which would re-evaluate the tokenizer for every
 * dimension the comparison reads.
 */
function textPredicate(column: Column, operator: string, parsed: ParsedCostTerm): SQL {
  const predicate = costComparison(arrayDimensions(sql`cost_tokens.tokens`), operator, parsed);

  return sql`EXISTS (
    SELECT 1
    FROM (SELECT ${costTokensSql(sql`${column}`)} AS tokens OFFSET 0) AS cost_tokens
    WHERE ${predicate}
  )`;
}

const fixedSymbolSet = new Set<string>(searchCostFixedSymbols);

/** Dimensions read from a precomputed dictionary row. */
function dictionaryDimensions(dictionary: CostDictionary): CostDimensions {
  /** Dedicated count column of one fixed symbol. */
  const fixedColumn = (symbol: string): Column =>
    dictionary[symbol.toLowerCase() as Lowercase<(typeof searchCostFixedSymbols)[number]>];

  return {
    symbolCount: symbol => fixedSymbolSet.has(symbol)
      ? sql<number>`${fixedColumn(symbol)}`
      : sql<number>`COALESCE(cardinality(array_positions(${dictionary.specials}, ${symbol})), 0)`,
    genericSum:      () => sql<number>`${dictionary.generic}`,
    hasExtraSymbols: queriedSymbols => {
      const queried = new Set(queriedSymbols);
      // Fixed symbols outside the query show up as a non-zero count column;
      // every other stored symbol must sit inside the queried set.
      const unqueriedFixed = searchCostFixedSymbols
        .filter(symbol => !queried.has(symbol))
        .map(symbol => sql`${fixedColumn(symbol)} > 0`);
      const queriedSpecials = queriedSymbols.filter(symbol => !fixedSymbolSet.has(symbol));
      const specialsArray = sql`ARRAY[${sql.join(queriedSpecials.map(symbol => sql`${symbol}`), sql`, `)}]::text[]`;

      return sql<boolean>`(${or(
        ...unqueriedFixed,
        sql`NOT (${dictionary.specials} <@ ${specialsArray})`,
      )})`;
    },
  };
}

export const cost = ca
  .adapt(costSchema)
  .handler(({ value, operator, qualifier, argType }, { column, table }) => {
    // Both the fact row and the accelerated part row store the same braced
    // text. Under acceleration that text is the `search_costs` key, so the
    // comparison runs on the dictionary row and the matching keys are
    // semi-joined back; otherwise the text is tokenized per row. Either way a
    // NULL column is a NULL whole cost, which positive predicates exclude.
    const context = table as { searchAcceleration?: unknown, costDictionary?: CostDictionary };
    const dictionary = context.searchAcceleration != null ? context.costDictionary : undefined;

    if (context.searchAcceleration != null && dictionary == null) {
      throw new Error('The accelerated Magic search table does not expose the cost dictionary.');
    }

    const matchTerm = (term: string) => {
      if (term.toLowerCase() === 'null') {
        switch (operator) {
        case ':':
          return isNull(column);
        default:
          throw new QueryError({
            type:    'unsupported-operator',
            payload: { op: operator, qual: qualifier, param: term },
          });
        }
      }

      const parsed = parseCostTerm(term);

      if (dictionary == null) {
        return and(isNotNull(column), textPredicate(column, operator, parsed))!;
      }

      const matchingKeys = sql`(
        SELECT ${dictionary.cost}
        FROM ${dictionary}
        WHERE ${dictionary.deletedAt} IS NULL
          AND ${costComparison(dictionaryDimensions(dictionary), operator, parsed)}
      )`;

      return and(isNotNull(column), sql`${column} IN ${matchingKeys}`)!;
    };

    // Positive predicates exclude NULL; the `!` qualifier is the logical
    // complement of the whole combined predicate, which then includes NULL.
    const combined = argType === 'id'
      ? matchValueGroups(splitValueGroups(value), matchTerm)
      : matchTerm(value);
    return qualifier.includes('!') ? not(combined) : combined;
  });
