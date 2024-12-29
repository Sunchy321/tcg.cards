import { DBQuery, QueryOption, ServerCommandOf } from '../../server';
import { QueryError } from '../../error';

import { NumberCommand } from './index';

export type NumberServerCommand = ServerCommandOf<NumberCommand>;

export type NumberServerOption = {
    key?: string;
};

export type NumberQueryOption = QueryOption<NumberCommand, NumberServerOption>;

function query(options: NumberQueryOption): DBQuery {
    const {
        key, parameter, operator, qualifier, meta,
    } = options;

    const num = meta.allowFloat ? Number.parseFloat(parameter) : Number.parseInt(parameter, 10);

    if (Number.isNaN(num)) {
        throw new QueryError({ type: 'invalid-query' });
    }

    switch (operator) {
    case '=':
        if (!qualifier.includes('!')) {
            return { [key]: { $eq: num } };
        } else {
            return { [key]: { $ne: num } };
        }
    case '>':
        return { [key]: { $gt: num } };
    case '>=':
        return { [key]: { $gte: num } };
    case '<':
        return { [key]: { $lt: num } };
    case '<=':
        return { [key]: { $lte: num } };
    default:
        throw new QueryError({ type: 'invalid-query' });
    }
}

export default function number(command: NumberCommand, options?: NumberServerOption): NumberServerCommand {
    const { key = command.id } = options ?? { };

    return {
        ...command,
        query: args => query({ key, ...args }),
    };
}

number.query = query;
