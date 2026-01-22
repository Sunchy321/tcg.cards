import { ca } from '../adapter';

import { numberSet as numberSetSchema } from '@search/command/builtin';

import { QueryError } from '@search/command/error';

import { sql } from 'drizzle-orm';

export const numberSet = ca
    .adapt(numberSetSchema)
    .handler(({ value, operator, qualifier }, { column }) => {
        const number = Number.parseInt(value, 10);

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
    });
