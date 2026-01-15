import { ca } from '@/search/command/adapter';

import { text as textSchema } from '@search/command/builtin/text';

import { QueryError } from '@search/command/error';

import { eq, ilike, like, ne, not, notLike, sql } from 'drizzle-orm';

function convertJSRegexToPG(pattern: string): string {
    return pattern
        // 转换单词边界
        .replace(/\\b/g, '\\y')
        // 移除非贪婪标记(可能需要警告用户)
        .replace(/([*+?])\?/g, '$1');
}

export const text = ca
    .adapt(textSchema)
    .$meta<{ multiline: boolean }>()
    .$meta<{ caseSensitive: boolean }>({ caseSensitive: false })
    .handler(({ value, operator, qualifier }, { meta, column }) => {
        const { multiline, caseSensitive } = meta;

        if (typeof value === 'string') {
            const escaped = value.replace(/%/g, '\\%').replace(/_/g, '\\_');

            switch (operator) {
            case ':':
                if (!qualifier.includes('!')) {
                    if (value === '') {
                        return sql`(${column} is null or ${column} = '')`;
                    } else if (caseSensitive) {
                        return like(column, `%${escaped}%`);
                    } else {
                        return ilike(column, `%${escaped}%`);
                    }
                } else {
                    if (value === '') {
                        return sql`(${column} is not null and ${column} != '')`;
                    } else if (caseSensitive) {
                        return notLike(column, `%${escaped}%`);
                    } else {
                        return not(ilike(column, `%${escaped}%`));
                    }
                }
            case '=':
                if (!qualifier.includes('!')) {
                    if (value === '') {
                        return sql`(${column} is null or ${column} = '')`;
                    } else if (caseSensitive) {
                        return eq(column, value);
                    } else {
                        return ilike(column, `${escaped}`);
                    }
                } else {
                    if (value === '') {
                        return sql`(${column} is not null and ${column} != '')`;
                    } else if (caseSensitive) {
                        return ne(column, value);
                    } else {
                        return not(ilike(column, `${escaped}`));
                    }
                }
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        } else {
            const pattern = convertJSRegexToPG(value.source);

            const flag = (multiline ? 'm' : '') + (caseSensitive ? '' : 'i');

            switch (operator) {
            case ':':
                if (!qualifier.includes('!')) {
                    return sql`regexp_like(${column}, ${pattern}, ${flag})`;
                } else {
                    return sql`not regexp_like(${column}, ${pattern}, ${flag})`;
                }
            case '=':
                if (!qualifier.includes('!')) {
                    return sql`regexp_like(${column}, ${`^${pattern}$`}, ${flag})`;
                } else {
                    return sql`not regexp_like(${column}, ${`^${pattern}$`}, ${flag})`;
                }
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }
    });
