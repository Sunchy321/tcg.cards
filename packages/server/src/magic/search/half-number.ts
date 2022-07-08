import { Command, command } from '@/search/command';
import { QueryError } from '@/search/error';

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

function query(
    key: string,
    param: string,
    op: ':' | '<' | '<=' | '=' | '>' | '>=',
    qual: '!'[],
) {
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
            if (!qual.includes('!')) {
                return { [key]: { $exists: true, $nin: toStatsList(statsNumber) } };
            } else {
                return { [key]: { $in: toStatsList(statsNumber) } };
            }
        } else {
            throw new QueryError({ type: 'invalid-query' });
        }
    case '=':
        if (!qual.includes('!')) {
            if (Number.isNaN(num)) {
                return { [key]: param };
            } else {
                return { [key]: { $in: equal } };
            }
        } else {
            if (Number.isNaN(num)) {
                return { [key]: { $ne: param } };
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

export default function halfNumber(config: {
    id: string;
    alt?: string[];
    key?: string;
}): Command<never, false, ':' | '<' | '<=' | '=' | '>' | '>=', '!'> {
    const { id, alt, key } = config;

    return command({
        id,
        alt,
        op: [':', '=', '<', '<=', '>', '>='],

        query: ({ param, op, qual }) => query(key ?? id, param, op, qual),
    });
}

halfNumber.query = query;
