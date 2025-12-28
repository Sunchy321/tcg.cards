import { ca } from '../adapter';

import { simple as simpleSchema } from '@search/command/builtin/simple';

import { QueryError } from '@search/command/error';

import { eq, inArray, ne, notInArray } from 'drizzle-orm';

export const simple = ca
    .adapt(simpleSchema)
    .handler(({ value, operator, qualifier }, { column }) => {
        switch (operator) {
        case ':':
            if (!qualifier.includes('!')) {
                return inArray(column, value.split(','));
            } else {
                return notInArray(column, value.split(','));
            }
        case '=':
            if (!qualifier.includes('!')) {
                return eq(column, value);
            } else {
                return ne(column, value);
            }
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    });
