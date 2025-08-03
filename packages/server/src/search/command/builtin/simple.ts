import { Column, SQL, eq, inArray, ne, notInArray } from 'drizzle-orm';

import { QueryOption, ServerCommandOf } from '../index';
import { QueryError } from '@search/command/error';

import { SimpleCommand } from '@search/command/builtin/simple';

export type SimpleServerCommand = ServerCommandOf<SimpleCommand>;

export type SimpleServerOption = {
    column: Column;
};

export type SimpleQueryOption = QueryOption<SimpleCommand, SimpleServerOption>;

function query(options: SimpleQueryOption): SQL {
    const { column, parameter, operator, qualifier } = options;

    if (typeof parameter !== 'string') {
        throw new QueryError({ type: 'invalid-query' });
    }

    switch (operator) {
    case ':':
        if (!qualifier.includes('!')) {
            return inArray(column, parameter.split(','));
        } else {
            return notInArray(column, parameter.split(','));
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
}

export default function simple(command: SimpleCommand, options: SimpleServerOption): SimpleServerCommand {
    const { column } = options;

    return {
        ...command,
        query: args => query({ column, ...args }),
    };
}

simple.query = query;
