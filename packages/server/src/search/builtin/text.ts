import { Command, command } from '@/search/command';

import { escapeRegExp } from 'lodash';

function query(
    key: string,
    param: RegExp | string,
    op: ':' | '=',
    qual: '!'[],
    multiline = true,
) {
    const regexSource = typeof param === 'string' ? escapeRegExp(param) : param.source;

    switch (op) {
    case ':':
        if (!qual.includes('!')) {
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
        if (!qual.includes('!')) {
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

export default function text(config: {
    id: string;
    alt?: string[];
    key?: string;
    multiline?: boolean;
}): Command<never, false, ':' | '=', '!'> {
    const {
        id, alt, key, multiline = true,
    } = config;

    return command({
        id,
        alt,
        op: [':', '='],

        query: ({ param, op, qual }) => query(key ?? id, param, op, qual, multiline),
    });
}

text.query = query;
