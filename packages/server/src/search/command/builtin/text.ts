import { Column, eq, like, ne, notLike, SQL, sql } from 'drizzle-orm';

import { QueryOption, ServerCommandOf } from '../index';
import { QueryError } from '@search/command/error';

import { TextCommand } from '@search/command/builtin/text';

export type TextServerCommand = ServerCommandOf<TextCommand>;

export type TextServerOption = {
    column:     Column;
    multiline?: boolean;
};

export type TextQueryOption = QueryOption<TextCommand, TextServerOption>;

function query(options: TextQueryOption): SQL {
    const { column, multiline, parameter, operator, qualifier } = options;

    if (typeof parameter === 'string') {
        const escaped = parameter.replace(/%/g, '\\%').replace(/_/g, '\\_');

        switch (operator) {
        case ':':
            if (!qualifier.includes('!')) {
                return like(column, `%${escaped}%`);
            } else {
                return notLike(column, `%${escaped}%`);
            }
        case '=':
            if (!qualifier.includes('!')) {
                return eq(column, parameter);
            } else {
                return ne(column, parameter);
            }
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    } else {
        const flag = multiline ? 'm' : '';

        switch (operator) {
        case ':':
            if (!qualifier.includes('!')) {
                return sql`regexp_like(${column}, ${parameter.source}, ${flag})`;
            } else {
                return sql`not regexp_like(${column}, ${parameter.source}, ${flag})`;
            }
        case '=':
            if (!qualifier.includes('!')) {
                return sql`regexp_like(${column}, ${`^${parameter.source}$`}, ${flag})`;
            } else {
                return sql`not regexp_like(${column}, ${`^${parameter.source}$`}, ${flag})`;
            }
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    }
}

export default function text(command: TextCommand, options: TextServerOption): TextServerCommand {
    const { column, multiline = true } = options;

    return {
        ...command,
        query: args => query({ column, ...args, multiline }),
    };
}

text.query = query;
