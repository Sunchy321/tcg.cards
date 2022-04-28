/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { QueryError } from '@/search';

export default function simpleQuery(
    key: string,
    param: RegExp | string,
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
        return { [key]: { $in: param.split(',') } };
    case '=':
        return { [key]: param };
    case '!:':
        return { [key]: { $nin: param.split(',') } };
    case '!=':
        return { [key]: { $ne: param } };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op ?? '',
        });
    }
}
