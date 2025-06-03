import { DBQuery, QueryOption, ServerCommandOf } from '../../server';

import { SimpleCommand } from './index';

export type SimpleServerCommand = ServerCommandOf<SimpleCommand>;

export type SimpleServerOption = {
    key?: string;
};

export type SimpleQueryOption = QueryOption<SimpleCommand, SimpleServerOption>;

function query(options: SimpleQueryOption): DBQuery {
    const {
        key, parameter, operator, qualifier,
    } = options;

    switch (operator) {
    case ':':
        if (!qualifier.includes('!')) {
            return { [key]: { $in: parameter.split(',') } };
        } else {
            return { [key]: { $nin: parameter.split(',') } };
        }
    case '=':
        if (!qualifier.includes('!')) {
            return { [key]: parameter };
        } else {
            return { [key]: { $ne: parameter } };
        }
    default:
        return {};
    }
}

export default function simple(command: SimpleCommand, options?: SimpleServerOption): SimpleServerCommand {
    const { key = command.id } = options ?? { };

    return {
        ...command,
        query: args => query({ key, ...args }),
    };
}

simple.query = query;
