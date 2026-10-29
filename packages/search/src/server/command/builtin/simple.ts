import { ca } from '#search/server/command/adapter';

import { simple as simpleSchema } from '#search/command/builtin/simple';

import { QueryError } from '#search/command/error';

import { matchValueGroups, splitValueGroups } from '#search/server/command/terms';

import { eq, inArray, ne, notInArray } from 'drizzle-orm';

export const simple = ca
  .adapt(simpleSchema)
  .handler(({ value, operator, qualifier, argType }, { column }) => {
    const matchTerm = (term: string) => {
      switch (operator) {
      case ':':
        if (!qualifier.includes('!')) {
          return inArray(column, term.split(','));
        } else {
          return notInArray(column, term.split(','));
        }
      case '=':
        if (!qualifier.includes('!')) {
          return eq(column, term);
        } else {
          return ne(column, term);
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
