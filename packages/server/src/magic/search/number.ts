/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { QueryError } from '@/search';

export default function numberQuery(
    key: string,
    param: string | RegExp,
    op: string | undefined,
) {
    if (param instanceof RegExp) {
        throw new QueryError({
            type:  'regex/disabled',
            value: op || '',
        });
    }

    const number = Number(param);

    if (Number.isNaN(number)) {
        throw new QueryError({
            type:  'number/nan',
            value: op || '',
        });
    }

    switch (op) {
    case '=':
        return { [key]: { $eq: number } };
    case '!=':
        return { [key]: { $ne: number } };
    case '>':
        return { [key]: { $gt: number } };
    case '>=':
        return { [key]: { $gte: number } };
    case '<':
        return { [key]: { $lt: number } };
    case '<=':
        return { [key]: { $lte: number } };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}
