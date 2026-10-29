import { ca } from '#search/server/command/adapter';

import { string as stringSchema } from '#search/command/builtin/string';

import { QueryError } from '#search/command/error';

import { matchValueGroups, splitValueGroups } from '#search/server/command/terms';

import { eq, gt, gte, lt, lte, ne } from 'drizzle-orm';

export const string = ca
  .adapt(stringSchema)
  .handler(({ value, operator, qualifier, argType }, { column }) => {
    const matchTerm = (term: string) => {
      switch (operator) {
      case ':':
      case '=':
        if (!qualifier.includes('!')) {
          return eq(column, term);
        } else {
          return ne(column, term);
        }
      case '>':
        return gt(column, term);
      case '>=':
        return gte(column, term);
      case '<':
        return lt(column, term);
      case '<=':
        return lte(column, term);
      default:
        throw new QueryError({ type: 'invalid-query' });
      }
    };

    if (argType === 'id') {
      return matchValueGroups(splitValueGroups(value), matchTerm);
    }

    return matchTerm(value);
  });
