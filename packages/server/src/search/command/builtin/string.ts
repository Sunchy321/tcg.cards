import { ca } from '@/search/command/adapter';

import { string as stringSchema } from '@search/command/builtin/string';

import { QueryError } from '@search/command/error';

import { eq, gt, gte, lt, lte, ne } from 'drizzle-orm';

export const string = ca
    .adapt(stringSchema)
    .handler(({ value, operator, qualifier }, { column }) => {
        switch (operator) {
        case ':':
        case '=':
            if (!qualifier.includes('!')) {
                return eq(column, value);
            } else {
                return ne(column, value);
            }
        case '>':
            return gt(column, value);
        case '>=':
            return gte(column, value);
        case '<':
            return lt(column, value);
        case '<=':
            return lte(column, value);
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    });
