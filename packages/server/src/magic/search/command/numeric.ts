import { ca } from '@/search/command/adapter';

import { numeric as numericSchema } from '@model/magic/search/command/numeric';

import { QueryError } from '@search/command/error';

import { and, eq, gt, gte, isNotNull, isNull, lt, lte, ne, sql } from 'drizzle-orm';

export const numeric = ca
    .adapt(numericSchema)
    .handler(({ value: rawValue, operator, qualifier }, { column }) => {
        // special case for [X]
        const value = (() => {
            if (rawValue === 'x') {
                return rawValue.toUpperCase();
            }

            return rawValue;
        })();

        const num = Number.parseFloat(value);

        switch (operator) {
        case ':':
            if (value === 'nan') {
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
                    return eq(column, value);
                } else {
                    return ne(column, value);
                }
            }
        case '=':
            if (!qualifier.includes('!')) {
                if (Number.isNaN(num)) {
                    return eq(column, value);
                } else {
                    return eq(sql`string_to_double(${column})`, num);
                }
            } else {
                if (Number.isNaN(num)) {
                    return ne(column, value);
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
    });
