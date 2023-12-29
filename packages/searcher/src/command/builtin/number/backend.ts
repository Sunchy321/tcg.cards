import { BackendOf, DBQuery, QueryFuncOf } from '../../backend';
import { QueryError } from '../../error';

import { NumberCommand } from './index';

export type NumberBackendCommand = BackendOf<NumberCommand>;

export type NumberBackendOption = {
    key?: string;
};

export type NumberQueryOption = Parameters<QueryFuncOf<NumberCommand>>[0] & { key: string, allowFloat?: boolean };

function query(options: NumberQueryOption): DBQuery {
    const {
        key, allowFloat = false, parameter, operator, qualifier,
    } = options;

    const num = allowFloat ? Number.parseFloat(parameter) : Number.parseInt(parameter, 10);

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

export default function number(command: NumberCommand, options?: NumberBackendOption): NumberBackendCommand {
    const { key = command.id } = options ?? { };

    return {
        ...command,
        query: args => query({ key, ...args }),
    };
}

number.query = query;
