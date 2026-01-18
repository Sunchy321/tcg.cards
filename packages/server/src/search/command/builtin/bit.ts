import { ca } from '@/search/command/adapter';

import { bit as bitSchema, Word } from '@search/command/builtin/bit';

import { QueryError } from '@search/command/error';

import { and, eq, gt, gte, lt, lte, ne, sql } from 'drizzle-orm';

export const bit = ca
    .adapt(bitSchema)
    .handler(({ value, operator, qualifier }, { meta, column }) => {
        const { words = {}, values } = meta;

        const word = words[value];

        const match: Word = (() => {
            if (word != null) {
                return word;
            }

            if (/^\d+/.test(value) && !/\d/.test(values)) {
                return {
                    type:  'count',
                    value: '?' + value,
                };
            }

            return {
                type:  'exact',
                value: value.toUpperCase().split('').filter(c => values.includes(c)).join(''),
            };
        })();

        switch (match.type) {
        case 'exact': {
            const matchValue = match.value.toUpperCase();
            const bitText = column.mapToDriverValue(matchValue);

            switch (operator) {
            case '=':
                if (!qualifier.includes('!')) {
                    return eq(column, matchValue);
                } else {
                    return ne(column, matchValue);
                }
            case '>':
                return and(
                    ne(column, matchValue),
                    eq(sql`${column} & ${bitText}`, bitText),
                )!;
            case ':':
            case '>=':
                return eq(sql`${column} & ${bitText}`, bitText);
            case '<':
                return and(
                    ne(column, matchValue),
                    eq(sql`~${column} & ~${bitText}`, sql`~${bitText}`),
                )!;
            case '<=':
                return eq(sql`~${column} & ~${bitText}`, sql`~${bitText}`);
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }
        case 'count': {
            const { op, count } = (() => {
                const m = /^([<>=?]|>=|<=)(\d+)$/.exec(match.value)!;

                if (m[1] != '?') {
                    if (![':', '='].includes(operator)) {
                        throw new QueryError({ type: 'invalid-query' });
                    }

                    return {
                        op:    m[1],
                        count: Number.parseInt(m[2], 10),
                    };
                } else {
                    return {
                        op:    operator,
                        count: Number.parseInt(m[2], 10),
                    };
                }
            })();

            switch (op) {
            case '=':
            case ':':
                if (!qualifier.includes('!')) {
                    return eq(sql`bit_count(${column})`, count);
                } else {
                    return ne(sql`bit_count(${column})`, count);
                }
            case '>':
                return gt(sql`bit_count(${column})`, count);
            case '>=':
                return gte(sql`bit_count(${column})`, count);
            case '<':
                return lt(sql`bit_count(${column})`, count);
            case '<=':
                return lte(sql`bit_count(${column})`, count);
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    });
