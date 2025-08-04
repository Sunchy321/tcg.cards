import { and, Column, gt, gte, inArray, lt, notInArray, SQL, eq, lte, ne, sql } from 'drizzle-orm';

import { QueryOption, ServerCommandOf } from '../index';
import { QueryError } from '@search/command/error';

import { BitCommand, Word } from '@search/command/builtin/bit';

export type BitServerCommand = ServerCommandOf<BitCommand>;

export type BitServerOption = {
    column: Column;
};

export type BitQueryOption = QueryOption<BitCommand, BitServerOption>;

function toBit(value: string, values: string): string {
    return values.split('').map(
        c => c != ' ' && value.toUpperCase().includes(c) ? '1' : '0',
    ).join('');
}

function query(options: BitQueryOption): SQL {
    const {
        column, parameter, operator, qualifier, meta: { values, words = {} },
    } = options;

    const word = words[parameter];

    const match: Word = (() => {
        if (word != null) {
            return word;
        }

        if (/^\d+/.test(parameter) && !/\d/.test(values)) {
            return {
                type:  'count',
                value: '?' + parameter,
            };
        }

        return {
            type:  'exact',
            value: parameter.toUpperCase().split('').filter(c => values.includes(c)).join(''),
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
}

export default function number(command: BitCommand, options: BitServerOption): BitServerCommand {
    const { column } = options;

    return {
        ...command,
        query: args => query({ column, ...args }),
    };
}

number.query = query;
