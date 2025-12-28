import { ca } from '@/search/command/adapter';

import { number as numberSchema } from '@search/command/builtin/number';

import { QueryError } from '@search/command/error';

import { eq, gt, gte, lt, lte, ne } from 'drizzle-orm';

export const number = ca
    .adapt(numberSchema)
    .handler(({ value, operator, qualifier }, { meta, column }) => {
        const num = meta.allowFloat ? Number.parseFloat(value) : Number.parseInt(value, 10);

        if (Number.isNaN(num)) {
            throw new QueryError({ type: 'invalid-query' });
        }

        switch (operator) {
        case '=':
            if (!qualifier.includes('!')) {
                return eq(column, num);
            } else {
                return ne(column, num);
            }
        case '>':
            return gt(column, num);
        case '>=':
            return gte(column, num);
        case '<':
            return lt(column, num);
        case '<=':
            return lte(column, num);
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    });
