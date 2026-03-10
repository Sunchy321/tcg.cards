import { ca } from '#search/server/command/adapter';

import { specificManaSymbols } from '#model/magic/schema/basic';
import { cost as costSchema } from '#model/magic/search/command/cost';

import { QueryError } from '#search/command/error';

import type { Column, SQL } from 'drizzle-orm';
import { and, isNotNull, isNull, or, sql } from 'drizzle-orm';

// Count occurrences of a specific symbol in the cost array
function symbolCount(column: Column, symbol: string): SQL<number> {
  return sql<number>`cardinality(array_positions(${column}, ${symbol}))`;
}

// Sum of generic (numeric) mana elements in the cost array
// e.g. ['3', 'W', 'W'] → 3
function genericSum(column: Column): SQL<number> {
  return sql<number>`COALESCE((SELECT SUM(s::int) FROM unnest(${column}) s WHERE s ~ '^[0-9]+$'), 0)`;
}

// Compute the expected total mana value from a costMap
function expectedManaValue(costMap: Record<string, number>): number {
  let mv = costMap['<generic>']!;

  for (const [sym, count] of Object.entries(costMap)) {
    if (sym === '<generic>' || count === 0) {
      continue;
    } else if (sym === 'X' || sym === 'Y' || sym === 'Z') {
      continue; // 0 MV
    } else if (sym === 'HW' || sym === 'HR' || sym === 'H1') {
      mv += 0.5 * count; // 0.5 MV each
    } else if (sym.startsWith('2/')) {
      mv += 2 * count; // 2 MV each
    } else {
      mv += count; // 1 MV each (W/U hybrid, W, U, etc.)
    }
  }

  return mv;
}

export const cost = ca
  .adapt(costSchema)
  .$meta<{ getManaValueCol: <Table>(table: Table) => Column }>()
  .handler(({ value, operator, qualifier }, { meta, column, table }) => {
    const { getManaValueCol } = meta;
    const manaValueCol = getManaValueCol(table);

    if (value === 'null') {
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

    const costs = value
      .toUpperCase()
      .split(/\{([^{}]*)\}|(\d{2,})|(H[WR1])|(.(?:\/.)?)/)
      .filter(v => v !== '' && v != null);

    const costMap = Object.fromEntries(
      ['<generic>', ...specificManaSymbols].map(s => [s, 0]),
    );

    for (const c of costs) {
      if (/^\d+$/.test(c)) {
        costMap['<generic>']! += Number.parseInt(c, 10);
      } else {
        costMap[c]! += 1;
      }
    }

    const genericCount = costMap['<generic>']!;

    // All entries with non-zero count, excluding '<generic>'
    const nonZeroSpecific = Object.entries(costMap)
      .filter(([k, v]) => k !== '<generic>' && v > 0) as [string, number][];

    // All entries including zero-count, excluding '<generic>'
    const allSpecific = Object.entries(costMap)
      .filter(([k]) => k !== '<generic>') as [string, number][];

    // Build "symbol count op N" SQL conditions
    const symbolCond = (sym: string, n: number, op: '>=' | '=' | '<=' | '>' | '<' | '<>'): SQL =>
      sql`${symbolCount(column, sym)} ${sql.raw(op)} ${n}`;

    // Generic mana condition
    const genericCond = (n: number, op: '>=' | '=' | '<=' | '>' | '<' | '<>'): SQL =>
      sql`${genericSum(column)} ${sql.raw(op)} ${n}`;

    // "at least N occurrences" conditions for all non-zero entries
    const containsAtLeast = (): SQL[] => [
      ...nonZeroSpecific.map(([s, n]) => symbolCond(s, n, '>=')),
      ...(genericCount > 0 ? [genericCond(genericCount, '>=')] : []),
    ];

    // "at most N occurrences" conditions for ALL symbols (including zero-count)
    const containsAtMost = (): SQL[] => [
      ...allSpecific.map(([s, n]) => symbolCond(s, n, '<=')),
      genericCond(genericCount, '<='),
    ];

    // "exactly N occurrences" conditions + manaValue for completeness
    const exactEquals = (): SQL[] => [
      ...nonZeroSpecific.map(([s, n]) => symbolCond(s, n, '=')),
      genericCond(genericCount, '='),
      sql`${manaValueCol} = ${expectedManaValue(costMap)}`,
    ];

    // "not equal" disjunction for > and < strict operators (at least one must differ)
    // Note: we always include the generic condition to ensure the disjunction is non-empty
    const notEqualOrCond = (): SQL =>
      or(
        genericCond(genericCount, '<>'),
        ...nonZeroSpecific.map(([s, n]) => symbolCond(s, n, '<>')),
      )!;

    switch (operator) {
    case ':': {
      const conds = containsAtLeast();
      if (qualifier.includes('!')) {
        // NOT (contains at least) = at least one symbol is less than required
        return or(
          ...nonZeroSpecific.map(([s, n]) => symbolCond(s, n, '<')),
          ...(genericCount > 0 ? [genericCond(genericCount, '<')] : []),
        )!;
      }
      return and(...conds)!;
    }

    case '=': {
      if (qualifier.includes('!')) {
        // NOT exactly equal: any deviation counts
        return or(
          isNull(column),
          genericCond(genericCount, '<>'),
          sql`${manaValueCol} <> ${expectedManaValue(costMap)}`,
          ...nonZeroSpecific.map(([s, n]) => symbolCond(s, n, '<>')),
        )!;
      }
      return and(isNotNull(column), ...exactEquals())!;
    }

    case '>=': {
      const conds = containsAtLeast();
      if (qualifier.includes('!')) {
        // NOT >= = <
        return or(
          ...nonZeroSpecific.map(([s, n]) => symbolCond(s, n, '<')),
          ...(genericCount > 0 ? [genericCond(genericCount, '<')] : []),
        )!;
      }
      return and(...conds)!;
    }

    case '>': {
      if (qualifier.includes('!')) {
        // NOT > = <=
        return and(...containsAtMost())!;
      }
      return and(
        ...containsAtLeast(),
        notEqualOrCond(),
      )!;
    }

    case '<=': {
      if (qualifier.includes('!')) {
        // NOT <= = >
        return and(
          ...containsAtLeast(),
          notEqualOrCond(),
        )!;
      }
      return and(...containsAtMost())!;
    }

    case '<': {
      if (qualifier.includes('!')) {
        // NOT < = >=
        return and(...containsAtLeast())!;
      }
      return and(
        ...containsAtMost(),
        notEqualOrCond(),
      )!;
    }

    default:
      throw new QueryError({ type: 'invalid-query' });
    }
  });
