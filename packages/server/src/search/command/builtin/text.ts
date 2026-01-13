import { ca } from '@/search/command/adapter';

import { text as textSchema } from '@search/command/builtin/text';

import { QueryError } from '@search/command/error';

import { eq, ilike, like, ne, not, notLike, sql } from 'drizzle-orm';

export const text = ca
    .adapt(textSchema)
    .$meta<{ multiline: boolean }>()
    .$meta<{ caseSensitive: boolean }>({ caseSensitive: true })
    .handler(({ value, operator, qualifier }, { meta, column }) => {
        const { multiline, caseSensitive } = meta;

        if (typeof value === 'string') {
            const escaped = value.replace(/%/g, '\\%').replace(/_/g, '\\_');

            switch (operator) {
            case ':':
                if (!qualifier.includes('!')) {
                    if (caseSensitive) {
                        return like(column, `%${escaped}%`);
                    } else {
                        return ilike(column, `%${escaped}%`);
                    }
                } else {
                    if (caseSensitive) {
                        return notLike(column, `%${escaped}%`);
                    } else {
                        return not(ilike(column, `%${escaped}%`));
                    }
                }
            case '=':
                if (!qualifier.includes('!')) {
                    if (caseSensitive) {
                        return eq(column, value);
                    } else {
                        return ilike(column, `${escaped}`);
                    }
                } else {
                    if (caseSensitive) {
                        return ne(column, value);
                    } else {
                        return not(ilike(column, `${escaped}`));
                    }
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
