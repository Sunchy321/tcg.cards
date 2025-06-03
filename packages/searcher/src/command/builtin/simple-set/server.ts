import { DBQuery, QueryOption, ServerCommandOf } from '../../server';

import { SimpleSetCommand } from './index';

export type SimpleSetServerCommand = ServerCommandOf<SimpleSetCommand>;

export type SimpleSetServerOption = {
    key?: string;
};

export type SimpleSetQueryOption = QueryOption<SimpleSetCommand, SimpleSetServerOption>;

function query(options: SimpleSetQueryOption): DBQuery {
    const {
        key, parameter, operator, qualifier, meta,
    } = options;

    const words = (() => {
        const decoded = parameter.split('').map(
            c => Object.entries(meta.valueMap)
                .find(([_, v]) => v.includes(c))?.[0],
        );

        if (decoded.every(v => v != null)) {
            return decoded;
        } else {
            return parameter.split(',');
        }
    })();

    switch (operator) {
    case ':':
        if (!qualifier.includes('!')) {
            return { [key]: { $in: words } };
        } else {
            return { [key]: { $nin: words } };
        }
    case '=':
        if (!qualifier.includes('!')) {
            return { [key]: words };
        } else {
            return { [key]: { $ne: words } };
        }
    default:
        return {};
    }
}

export default function simpleSet(command: SimpleSetCommand, options?: SimpleSetServerOption): SimpleSetServerCommand {
    const { key = command.id } = options ?? { };

    return {
        ...command,
        query: args => query({ key, ...args }),
    };
}

simpleSet.query = query;
