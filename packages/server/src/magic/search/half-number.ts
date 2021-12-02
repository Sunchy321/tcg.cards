/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { QueryError } from '@/search';
import { range } from 'lodash';

const statsNumber = range(-10, 100, 0.5);

function toStatsList(numbers: number[]) {
    const result = [];

    for (const n of numbers) {
        result.push(n.toString());

        // Augment cards with stats +X/+Y
        if (n > 0 && Number.isInteger(n)) {
            result.push(`+${n}`);
        } else if (n === 0) {
            result.push('+0', '-0');
        }
    }

    return result;
}

export default function halfNumberQuery(
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

    // special case for [X]
    if (param === 'x') {
        param = param.toUpperCase();
    }

    const num = Number(param);

    const less = Number.isNaN(num) ? [] : toStatsList(statsNumber.filter(s => s < num));
    const equal = Number.isNaN(num) ? [] : toStatsList(statsNumber.filter(s => s === num));
    const greater = Number.isNaN(num) ? [] : [
        ...toStatsList(statsNumber.filter(s => s > num)),
        '∞',
    ];

    switch (op) {
    case ':':
        if (param === '*') {
            return { [key]: { $exists: true, $nin: toStatsList(statsNumber) } };
        } else {
            throw new QueryError({
                type:  'operator/unsupported',
                value: op ?? '',
            });
        }
    case '!:':
        if (param === '*') {
            return { [key]: { $in: toStatsList(statsNumber) } };
        } else {
            throw new QueryError({
                type:  'operator/unsupported',
                value: op ?? '',
            });
        }
    case '=':
        if (Number.isNaN(num)) {
            return { [key]: param };
        } else {
            return { [key]: { $in: equal } };
        }
    case '!=':
        if (Number.isNaN(num)) {
            return { [key]: { $ne: param } };
        } else {
            return { [key]: { $exists: true, $nin: equal } };
        }
    case '>':
        if (Number.isNaN(num)) {
            throw new QueryError({
                type:  'operator/unsupported',
                value: op ?? '',
            });
        } else {
            return { [key]: { $in: greater } };
        }
    case '>=':
        if (Number.isNaN(num)) {
            throw new QueryError({
                type:  'operator/unsupported',
                value: op ?? '',
            });
        } else {
            return { [key]: { $in: [...greater, ...equal] } };
        }
    case '<':
        if (Number.isNaN(num)) {
            throw new QueryError({
                type:  'operator/unsupported',
                value: op ?? '',
            });
        } else {
            return { [key]: { $in: less } };
        }
    case '<=':
        if (Number.isNaN(num)) {
            throw new QueryError({
                type:  'operator/unsupported',
                value: op ?? '',
            });
        } else {
            return { [key]: { $in: [...less, ...equal] } };
        }
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op ?? '',
        });
    }
}
