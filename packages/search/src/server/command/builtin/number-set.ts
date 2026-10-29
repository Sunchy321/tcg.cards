import { ca } from '#search/server/command/adapter';

import { numberSet as numberSetSchema } from '#search/command/builtin';

import { QueryError } from '#search/command/error';

import { matchValueGroups, splitValueGroups } from '#search/server/command/terms';

import { sql } from 'drizzle-orm';

export const numberSet = ca
  .adapt(numberSetSchema)
  .handler(({ value, operator, qualifier, argType }, { column }) => {
    const matchTerm = (term: string) => {
      const number = Number.parseInt(term, 10);

      if (Number.isNaN(number)) {
        throw new QueryError({ type: 'invalid-query' });
      }

      switch (operator) {
      case ':':
      case '=':
        if (!qualifier.includes('!')) {
          return sql`${number} = ANY(${column})`;
        } else {
          return sql`NOT (${number} = ANY(${column}))`;
        }
      case '<':
        if (!qualifier.includes('!')) {
          return sql`${number} > ANY(${column})`;
        } else {
          return sql`NOT (${number} > ANY(${column}))`;
        }
      case '<=':
        if (!qualifier.includes('!')) {
          return sql`${number} >= ANY(${column})`;
        } else {
          return sql`NOT (${number} >= ANY(${column}))`;
        }
      case '>':
        if (!qualifier.includes('!')) {
          return sql`${number} < ANY(${column})`;
        } else {
          return sql`NOT (${number} < ANY(${column}))`;
        }
      case '>=':
        if (!qualifier.includes('!')) {
          return sql`${number} <= ANY(${column})`;
        } else {
          return sql`NOT (${number} <= ANY(${column}))`;
        }
      default:
        throw new QueryError({ type: 'invalid-query' });
      }
    };

    if (argType === 'id') {
      return matchValueGroups(splitValueGroups(value), matchTerm);
    }

    return matchTerm(value);
  });
