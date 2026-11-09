import { ca } from '#search/server/command/adapter';

import { simpleSet as simplSetSchema } from '#search/command/builtin';

import { QueryError } from '#search/command/error';

import { matchValueGroups, splitValueGroups } from '#search/server/command/terms';

import { arrayContains, eq, ne, not } from 'drizzle-orm';

export const simpleSet = ca
  .adapt(simplSetSchema)
  .handler(({ value, operator, qualifier, argType }, { meta, column }) => {
    const { valueMap } = meta;

    const matchTerm = (term: string) => {
      const words = (() => {
        const decoded = term.split('').map(
          c => Object.entries(valueMap)
            .find(([_, v]) => v.includes(c))?.[0],
        );

        if (decoded.every(v => v != null)) {
          return decoded;
        } else {
          return term.split(',');
        }
      })();

      switch (operator) {
      case ':':
        if (!qualifier.includes('!')) {
          return arrayContains(column, words);
        } else {
          return not(arrayContains(column, words));
        }
      case '=':
        if (!qualifier.includes('!')) {
          return eq(column, words);
        } else {
          return ne(column, words);
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
