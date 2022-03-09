/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { QueryError } from '@/search';

export default function simpleQuery(
    key: string,
    param: string | RegExp,
    op: string | undefined,
) {
    if (typeof param !== 'string') {
        throw new QueryError({
            type:  'regex/disabled',
            value: '',
        });
    }

    switch (op) {
    case ':':
    case '=':
        return { [key]: param };
    case '!:':
    case '!=':
        return { [key]: { $ne: param } };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}
