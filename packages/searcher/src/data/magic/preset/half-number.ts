import {
    Command, createCommand, DBQuery, DefaultQualifier, defaultQualifier, AllOperator, allOperator,
} from '../../../command';
import { QueryError } from '../../../command/error';

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

export type HalfNumberCommand = Command<never, AllOperator, DefaultQualifier, false>;

export type HalfNumberOption = {
    id: string;
    alt?: string[] | string;
    key?: string;
};

export type HalfNumberQueryOption = Parameters<HalfNumberCommand['query']>[0] & { key: string };

function query(options: HalfNumberQueryOption): DBQuery {
    const {
        key, parameter: rawParameter, operator, qualifier,
    } = options;

    // special case for [X]
    const parameter = (() => {
        if (rawParameter === 'x') {
            return rawParameter.toUpperCase();
        }

        return rawParameter;
    })();

    const num = Number.parseInt(parameter, 10);

    const less = Number.isNaN(num) ? [] : toStatsList(statsNumber.filter(s => s < num));
    const equal = Number.isNaN(num) ? [] : toStatsList(statsNumber.filter(s => s === num));
    const greater = Number.isNaN(num) ? [] : [
        ...toStatsList(statsNumber.filter(s => s > num)),
        '∞',
    ];

    switch (operator) {
    case ':':
        if (parameter === '*') {
            if (!qualifier.includes('!')) {
                return { [key]: { $exists: true, $nin: toStatsList(statsNumber) } };
            } else {
                return { [key]: { $in: toStatsList(statsNumber) } };
            }
        } else {
            throw new QueryError({ type: 'invalid-query' });
        }
    case '=':
        if (!qualifier.includes('!')) {
            if (Number.isNaN(num)) {
                return { [key]: parameter };
            } else {
                return { [key]: { $in: equal } };
            }
        } else {
            if (Number.isNaN(num)) {
                return { [key]: { $ne: parameter } };
            } else {
                return { [key]: { $exists: true, $nin: equal } };
            }
        }
    case '>':
        if (Number.isNaN(num)) {
            throw new QueryError({ type: 'invalid-query' });
        } else {
            return { [key]: { $in: greater } };
        }
    case '>=':
        if (Number.isNaN(num)) {
            throw new QueryError({ type: 'invalid-query' });
        } else {
            return { [key]: { $in: [...greater, ...equal] } };
        }
    case '<':
        if (Number.isNaN(num)) {
            throw new QueryError({ type: 'invalid-query' });
        } else {
            return { [key]: { $in: less } };
        }
    case '<=':
        if (Number.isNaN(num)) {
            throw new QueryError({ type: 'invalid-query' });
        } else {
            return { [key]: { $in: [...less, ...equal] } };
        }
    default:
        return 0;
    }
}

export default function halfNumber(options: HalfNumberOption): HalfNumberCommand {
    const {
        id, alt, key = id,
    } = options;

    return createCommand({
        id,
        alt,
        operators:  allOperator,
        qualifiers: defaultQualifier,

        query: arg => query({ key, ...arg }),
    });
}

halfNumber.query = query;
