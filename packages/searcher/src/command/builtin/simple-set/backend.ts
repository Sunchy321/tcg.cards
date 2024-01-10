import { BackendOf, DBQuery, QueryOption } from '../../backend';

import { SimpleSetCommand } from './index';

export type SimpleSetBackendCommand = BackendOf<SimpleSetCommand>;

export type SimpleSetBackendOption = {
    key?: string;
};

export type SimpleSetQueryOption = QueryOption<SimpleSetCommand, SimpleSetBackendOption>;

function query(options: SimpleSetQueryOption): DBQuery {
    const {
        key, parameter, operator, qualifier, meta,
    } = options;

    const values = [];

    const words = parameter.split(',');

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

export default function simpleSet(command: SimpleSetCommand, options?: SimpleSetBackendOption): SimpleSetBackendCommand {
    const { key = command.id } = options ?? { };

    return {
        ...command,
        query: args => query({ key, ...args }),
    };
}

simpleSet.query = query;
