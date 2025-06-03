import { ServerCommandOf, DBQuery, QueryFuncOf } from '../../server';

import { TextCommand } from './index';

import { escapeRegExp } from 'lodash';

export type TextServerCommand = ServerCommandOf<TextCommand>;

export type TextServerOption = {
    key?:       string;
    multiline?: boolean;
};

export type TextQueryOption = Parameters<QueryFuncOf<TextCommand>>[0] & { key: string, multiline?: boolean };

function query(options: TextQueryOption): DBQuery {
    const {
        key, multiline = true, parameter, operator, qualifier,
    } = options;

    const regexSource = typeof parameter === 'string' ? escapeRegExp(parameter) : parameter.source;

    switch (operator) {
    case ':':
        if (!qualifier.includes('!')) {
            return {
                [key]: new RegExp(regexSource, multiline ? 'miu' : 'iu'),
            };
        } else {
            return {
                [key]: {
                    $not: new RegExp(regexSource, multiline ? 'miu' : 'iu'),
                },
            };
        }
    case '=':
        if (!qualifier.includes('!')) {
            return {
                [key]: new RegExp(`^${regexSource}$`, 'iu'),
            };
        } else {
            return {
                [key]: { $not: new RegExp(`^${regexSource}$`, 'iu') },
            };
        }
    default:
        return 0;
    }
}

export default function text(command: TextCommand, options?: TextServerOption): TextServerCommand {
    const { key = command.id, multiline } = options ?? { };

    return {
        ...command,
        query: args => query({ key, ...args, multiline }),
    };
}

text.query = query;
