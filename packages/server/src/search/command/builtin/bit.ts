import { and, Column, SQL, eq, ne, sql } from 'drizzle-orm';

import { QueryOption, ServerCommandOf } from '../index';
import { QueryError } from '@search/command/error';

import { BitCommand } from '@search/command/builtin/bit';

export type BitServerCommand = ServerCommandOf<BitCommand>;

export type BitServerOption = {
    column: Column;
};

export type BitQueryOption = QueryOption<BitCommand, BitServerOption>;

function query(options: BitQueryOption): SQL {
    const {
        column, parameter, operator, qualifier, meta: { values, words },
    } = options;

    const letters = (() => {
        if (words?.[parameter] != null) {
            return words[parameter];
        }

        return parameter.toUpperCase().split('').filter(c => values.includes(c));
    })();

    const bitText = values.split('').map(
        c => c != ' ' && letters.includes(c) ? '1' : '0',
    ).join('');

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

export default function number(command: BitCommand, options: BitServerOption): BitServerCommand {
    const { column } = options;

    return {
        ...command,
        query: args => query({ column, ...args }),
    };
}

number.query = query;
