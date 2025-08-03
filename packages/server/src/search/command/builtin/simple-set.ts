import { Column, notInArray, SQL, eq, inArray, ne } from 'drizzle-orm';

import { QueryOption, ServerCommandOf } from '../index';
import { QueryError } from '@search/command/error';

import { SimpleSetCommand } from '@search/command/builtin/simple-set';

export type SimpleSetServerCommand = ServerCommandOf<SimpleSetCommand>;

export type SimpleSetServerOption = {
    column: Column;
};

export type SimpleSetQueryOption = QueryOption<SimpleSetCommand, SimpleSetServerOption>;

function query(options: SimpleSetQueryOption): SQL {
    const { column, parameter, operator, qualifier, meta } = options;

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
            return inArray(column, words);
        } else {
            return notInArray(column, words);
        }
    case '=':
        if (!qualifier.includes('!')) {
            return eq(column, words);
        } else {
            return ne(column, words);
        }
    default:
        throw new QueryError({ type: 'invalid-query' });
    }
}

export default function simpleSet(command: SimpleSetCommand, options: SimpleSetServerOption): SimpleSetServerCommand {
    const { column } = options;

    return {
        ...command,
        query: args => query({ column, ...args }),
    };
}

simpleSet.query = query;
