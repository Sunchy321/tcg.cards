import {
    Command, createCommand, DBQuery, DefaultOperator, defaultOperator, DefaultQualifier, defaultQualifier,
} from '../../command';

import { escapeRegExp } from 'lodash';

export type TextCommand = Command<never, DefaultOperator, DefaultQualifier, true>;

export type TextOption = {
    id: string;
    alt?: string[] | string;
    key?: string;
    multiline?: boolean;
};

export type TextQueryOption = Parameters<TextCommand['query']>[0] & { key: string, multiline?: boolean };

function query(options: TextQueryOption): DBQuery {
    const {
        key, multiline = false, parameter, operator, qualifier,
    } = options;

    const regexSource = typeof parameter === 'string' ? escapeRegExp(parameter) : parameter.source;

    switch (operator) {
    case ':':
        if (!qualifier.includes('!')) {
            return {
                [key]: new RegExp(regexSource, multiline ? 'mi' : 'i'),
            };
        } else {
            return {
                [key]: {
                    $not: new RegExp(regexSource, multiline ? 'mi' : 'i'),
                },
            };
        }
    case '=':
        if (!qualifier.includes('!')) {
            return {
                [key]: new RegExp(`^${regexSource}$`, 'i'),
            };
        } else {
            return {
                [key]: { $not: new RegExp(`^${regexSource}$`, 'i') },
            };
        }
    default:
        return 0;
    }
}

export default function text(options: TextOption): TextCommand {
    const {
        id, alt, key = id, multiline = false,
    } = options;

    return createCommand({
        id,
        alt,
        operators:  defaultOperator,
        qualifiers: defaultQualifier,

        query: arg => query({ key, multiline, ...arg }),
    });
}

text.query = query;
