/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { QueryError } from '@/search';

import { escapeRegExp } from 'lodash';

export default function textQuery(
    key: string,
    param: string | RegExp,
    op: string | undefined,
    multiline = true,
) {
    const regexSource =
        typeof param === 'string' ? escapeRegExp(param) : param.source;

    switch (op) {
    case ':':
        return {
            [key]: new RegExp(regexSource, multiline ? 'mi' : 'i'),
        };
    case '!:':
        return {
            [key]: {
                $not: new RegExp(regexSource, multiline ? 'mi' : 'i'),
            },
        };
    case '=':
        return {
            [key]: new RegExp('^' + regexSource + '$', 'i'),
        };
    case '!=':
        return {
            [key]: { $not: new RegExp('^' + regexSource + '$', 'i') },
        };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}
