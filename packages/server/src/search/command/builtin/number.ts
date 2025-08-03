import { Column, SQL, eq, gt, gte, lt, lte, ne } from 'drizzle-orm';

import { QueryOption, ServerCommandOf } from '../index';
import { QueryError } from '@search/command/error';

import { NumberCommand } from '@search/command/builtin/number';

export type NumberServerCommand = ServerCommandOf<NumberCommand>;

export type NumberServerOption = {
    column: Column;
};

export type NumberQueryOption = QueryOption<NumberCommand, NumberServerOption>;

function query(options: NumberQueryOption): SQL {
    const {
        column, parameter, operator, qualifier, meta,
    } = options;

    const num = meta.allowFloat ? Number.parseFloat(parameter) : Number.parseInt(parameter, 10);

    if (Number.isNaN(num)) {
        throw new QueryError({ type: 'invalid-query' });
    }

    switch (operator) {
    case '=':
        if (!qualifier.includes('!')) {
            return eq(column, num);
        } else {
            return ne(column, num);
        }
    case '>':
        return gt(column, num);
    case '>=':
        return gte(column, num);
    case '<':
        return lt(column, num);
    case '<=':
        return lte(column, num);
    default:
        throw new QueryError({ type: 'invalid-query' });
    }
}

export default function number(command: NumberCommand, options: NumberServerOption): NumberServerCommand {
    const { column } = options;

    return {
        ...command,
        query: args => query({ column, ...args }),
    };
}

number.query = query;
