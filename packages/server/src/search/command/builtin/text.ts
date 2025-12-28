import { ca } from '@/search/command/adapter';

import { text as textSchema } from '@search/common/command/builtin/text';

import { QueryError } from '@search/command/error';

import { eq, like, ne, notLike, sql } from 'drizzle-orm';

export const text = ca
    .adapt(textSchema)
    .meta({ multiline: false })
    .handler(({ value, operator, qualifier }, { meta, column }) => {
        const { multiline } = meta;

        if (typeof value === 'string') {
            const escaped = value.replace(/%/g, '\\%').replace(/_/g, '\\_');

            switch (operator) {
            case ':':
                if (!qualifier.includes('!')) {
                    return like(column, `%${escaped}%`);
                } else {
                    return notLike(column, `%${escaped}%`);
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
        } else {
            const flag = multiline ? 'm' : '';

            switch (operator) {
            case ':':
                if (!qualifier.includes('!')) {
                    return sql`regexp_like(${column}, ${value.source}, ${flag})`;
                } else {
                    return sql`not regexp_like(${column}, ${value.source}, ${flag})`;
                }
            case '=':
                if (!qualifier.includes('!')) {
                    return sql`regexp_like(${column}, ${`^${value.source}$`}, ${flag})`;
                } else {
                    return sql`not regexp_like(${column}, ${`^${value.source}$`}, ${flag})`;
                }
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }
    });
