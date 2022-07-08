/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { command, Command } from '../command';
import { QueryError } from '@/search/error';

function query(
    key: string,
    param: string,
    op: '<' | '<=' | '=' | '>' | '>=',
    qual: '!'[],
) {
    const num = Number(param);

    if (Number.isNaN(num)) {
        throw new QueryError({ type: 'invalid-query' });
    }

    switch (op) {
    case '=':
        if (!qual.includes('!')) {
            return { [key]: { $eq: num } };
        } else {
            return { [key]: { $ne: num } };
        }
    case '>':
        return { [key]: { $gt: num } };
    case '>=':
        return { [key]: { $gte: num } };
    case '<':
        return { [key]: { $lt: num } };
    case '<=':
        return { [key]: { $lte: num } };
    default:
        throw new QueryError({ type: 'invalid-query' });
    }
}

export default function number(config: {
    id: string;
    alt?: string[];
    key?: string;
}): Command<never, false, '<' | '<=' | '=' | '>' | '>=', '!'> {
    const { id, alt, key } = config;

    return command({
        id,
        alt,
        op: ['=', '<', '<=', '>', '>='],

        query: ({ param, op, qual }) => query(key ?? id, param, op, qual),
    });
}

number.query = query;
