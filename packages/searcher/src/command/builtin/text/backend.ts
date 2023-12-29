import { BackendOf, DBQuery, QueryFuncOf } from '../../backend';

import { TextCommand } from './index';

import { escapeRegExp } from 'lodash';

export type TextBackendCommand = BackendOf<TextCommand>;

export type TextBackendOption = {
    key?: string;
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

export default function text(command: TextCommand, options?: TextBackendOption): TextBackendCommand {
    const { key = command.id, multiline } = options ?? { };

    return {
        ...command,
        query: args => query({ key, ...args, multiline }),
    };
}

text.query = query;
