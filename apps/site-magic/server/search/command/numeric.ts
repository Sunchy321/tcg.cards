import { ca } from '#search/server/command/adapter';

import { numeric as numericSchema } from '#model/magic/search/command/numeric';

import { QueryError } from '#search/command/error';

import { matchValueGroups, splitValueGroups } from '#search/server/command/terms';

import { and, eq, gt, gte, isNotNull, isNull, lt, lte, ne, sql } from 'drizzle-orm';

export const numeric = ca
  .adapt(numericSchema)
  .handler(({ value: rawValue, operator, qualifier, argType }, { column }) => {
    const matchTerm = (value: string) => {
      // special case for [X]
      const term = (() => {
        if (value === 'x') {
          return value.toUpperCase();
        }

        return value;
      })();

      const num = Number.parseFloat(term);

      switch (operator) {
      case ':':
        if (term === 'nan') {
          if (!qualifier.includes('!')) {
            return and(
              isNotNull(column),
              isNull(sql`string_to_double(${column})`),
            )!;
          } else {
            return and(
              isNotNull(column),
              isNotNull(sql`string_to_double(${column})`),
            )!;
          }
        } else {
          if (!qualifier.includes('!')) {
            return eq(column, term);
          } else {
            return ne(column, term);
          }
        }
      case '=':
        if (!qualifier.includes('!')) {
          if (Number.isNaN(num)) {
            return eq(column, term);
          } else {
            return eq(sql`string_to_double(${column})`, num);
          }
        } else {
          if (Number.isNaN(num)) {
            return ne(column, term);
          } else {
            return ne(sql`string_to_double(${column})`, num);
          }
        }
      case '>':
        if (Number.isNaN(num)) {
          throw new QueryError({ type: 'invalid-query' });
        } else {
          return gt(sql`string_to_double(${column})`, num);
        }
      case '>=':
        if (Number.isNaN(num)) {
          throw new QueryError({ type: 'invalid-query' });
        } else {
          return gte(sql`string_to_double(${column})`, num);
        }
      case '<':
        if (Number.isNaN(num)) {
          throw new QueryError({ type: 'invalid-query' });
        } else {
          return lt(sql`string_to_double(${column})`, num);
        }
      case '<=':
        if (Number.isNaN(num)) {
          throw new QueryError({ type: 'invalid-query' });
        } else {
          return lte(sql`string_to_double(${column})`, num);
        }
      default:
        throw new QueryError({ type: 'invalid-query' });
      }
    };

    if (argType === 'id') {
      return matchValueGroups(splitValueGroups(rawValue), matchTerm);
    }

    return matchTerm(rawValue);
  });
