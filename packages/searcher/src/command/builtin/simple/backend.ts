import { BackendOf, DBQuery, QueryOption } from '../../backend';

import { SimpleCommand } from './index';

export type SimpleBackendCommand = BackendOf<SimpleCommand>;

export type SimpleBackendOption = {
    key?: string;
};

export type SimpleQueryOption = QueryOption<SimpleCommand, SimpleBackendOption>;

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

export default function simple(command: SimpleCommand, options?: SimpleBackendOption): SimpleBackendCommand {
    const { key = command.id } = options ?? { };

    return {
        ...command,
        query: args => query({ key, ...args }),
    };
}

simple.query = query;
