import { ca } from '../adapter';

import { simpleSet as simplSetSchema } from '@search/common/command/builtin';

import { QueryError } from '@search/command/error';

import { arrayContains, eq, ne, not } from 'drizzle-orm';

export const simpleSet = ca
    .adapt(simplSetSchema)
    .handler(({ value, operator, qualifier }, { meta, column }) => {
        const { valueMap } = meta;

        const words = (() => {
            const decoded = value.split('').map(
                c => Object.entries(valueMap)
                    .find(([_, v]) => v.includes(c))?.[0],
            );

            if (decoded.every(v => v != null)) {
                return decoded;
            } else {
                return value.split(',');
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
    });
