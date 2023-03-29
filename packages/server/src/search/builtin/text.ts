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
    const flags = [
        multiline ? 'm' : '',
        typeof param === 'string' ? 'i' : '',
    ].join('');

    switch (op) {
    case ':':
        if (!qual.includes('!')) {
            return {
                [key]: { $regex: regexSource, $options: flags },
            };
        } else {
            return {
                [key]: {
                    $not: { $regex: regexSource, $options: flags },
                },
            };
        }
    case '=':
        if (!qual.includes('!')) {
            return {
                [key]: { $regex: `^${regexSource}$`, $options: flags },
            };
        } else {
            return {
                [key]: { $not: { $regex: `^${regexSource}$`, $options: flags } },
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
