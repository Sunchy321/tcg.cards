import { ca } from '@/search/command/adapter';

import { bit as bitSchema, Word } from '@search/command/builtin/bit';

import { QueryError } from '@search/command/error';

import { and, eq, gt, gte, inArray, lt, lte, ne, notInArray, sql } from 'drizzle-orm';

function toBit(value: string, values: string): string {
    return values.split('').map(
        c => c != ' ' && value.toUpperCase().includes(c) ? '1' : '0',
    ).join('');
}

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
            const bitText = toBit(match.value, values);

            switch (operator) {
            case ':':
            case '=':
                if (!qualifier.includes('!')) {
                    return eq(column, bitText);
                } else {
                    return ne(column, bitText);
                }
            case '>':
                return and(
                    ne(column, bitText),
                    eq(sql`${column} & ${bitText}`, bitText),
                )!;
            case '>=':
                return eq(sql`${column} & ${bitText}`, bitText);
            case '<':
                return and(
                    ne(column, bitText),
                    eq(sql`~${column} & ~${bitText}`, sql`~${bitText}`),
                )!;
            case '<=':
                return eq(sql`~${column} & ~${bitText}`, sql`~${bitText}`);
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }
        case 'enum': {
            const bitTexts = match.value.map(v => toBit(v, values));

            switch (operator) {
            case ':':
                if (!qualifier.includes('!')) {
                    return inArray(column, bitTexts);
                } else {
                    return notInArray(column, bitTexts);
                }
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }
        case 'count': {
            const { op, value } = (() => {
                const m = /^([<>=?]|>=|<=)(\d+)$/.exec(match.value)!;

                if (m[1] != '?') {
                    if (![':', '='].includes(operator)) {
                        throw new QueryError({ type: 'invalid-query' });
                    }

                    return {
                        op:    m[1],
                        value: Number.parseInt(m[2], 10),
                    };
                } else {
                    return {
                        op:    operator,
                        value: Number.parseInt(m[2], 10),
                    };
                }
            })();

            switch (op) {
            case '=':
            case ':':
                if (!qualifier.includes('!')) {
                    return eq(sql`bit_count(${column})`, value);
                } else {
                    return ne(sql`bit_count(${column})`, value);
                }
            case '>':
                return gt(sql`bit_count(${column})`, value);
            case '>=':
                return gte(sql`bit_count(${column})`, value);
            case '<':
                return lt(sql`bit_count(${column})`, value);
            case '<=':
                return lte(sql`bit_count(${column})`, value);
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    });
