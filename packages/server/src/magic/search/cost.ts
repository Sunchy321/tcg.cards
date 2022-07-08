import { Command, command } from '@/search/command';
import { QueryError } from '@/search/error';

import { flatten } from 'lodash';

import { specificManaSymbols } from '@data/magic/basic';

function query(
    param: string,
    op: ':' | '<' | '<=' | '=' | '>' | '>=',
    qual: '!'[],
): any {
    if (param === 'null') {
        switch (op) {
        case ':':
            if (!qual.includes('!')) {
                return { 'parts.cost': { $exists: false } };
            } else {
                return { 'parts.cost': { $exists: true } };
            }
        default:
            throw new QueryError({
                type:  'unsupported-operator',
                value: { op, qual, param },
            });
        }
    }

    const costs = param
        .toUpperCase()
        .split(/\{([^{}]*)\}|(\d{2,})|(H[WR1])|(.(?:\/.)?)/)
        .filter(v => v !== '' && v != null);

    const costMap = Object.fromEntries(
        ['', ...specificManaSymbols].map(s => [s, 0]),
    );

    for (const c of costs) {
        if (/^\d+$/.test(c)) {
            costMap[''] += Number.parseInt(c, 10);
        } else {
            costMap[c] += 1;
        }
    }

    const notEqual = Object.entries(costMap)
        .map(([k, v]) => {
            if (v !== 0) {
                return { [`parts.__costMap.${k}`]: { $ne: v } };
            } else {
                return { [`parts.__costMap.${k}`]: { $exists: true, $ne: 0 } };
            }
        });

    switch (op) {
    case ':':
        if (!qual.includes('!')) {
            return Object.fromEntries(
                Object.entries(costMap)
                    .filter(e => e[1] !== 0)
                    .map(([k, v]) => [`parts.__costMap.${k}`, k === '' ? v : { $gte: v }]),
            );
        } else {
            return {
                $or: flatten(
                    Object.entries(costMap)
                        .filter(e => e[1] !== 0)
                        .map(([k, v]) => [
                            { [`parts.__costMap.${k}`]: { $lt: v } },
                            { [`parts.__costMap.${k}`]: { $exists: false } },
                        ]),
                ),
            };
        }
    case '=':
        if (!qual.includes('!')) {
            return {
                $and: Object.entries(costMap)
                    .map(([k, v]) => (v === 0
                        ? {
                            $or: [
                                { [`parts.__costMap.${k}`]: 0 },
                                { [`parts.__costMap.${k}`]: { $exists: false } },
                            ],
                        }
                        : { [`parts.__costMap.${k}`]: v })),
            };
        } else {
            return {
                $or: [
                    { 'parts.cost': { $exists: false } },
                    ...notEqual,
                ],
            };
        }
    case '>=':
        return Object.fromEntries(
            Object.entries(costMap)
                .filter(e => e[1] !== 0)
                .map(([k, v]) => [`parts.__costMap.${k}`, { $gte: v }]),
        );
    case '>':
        return {
            $and: [
                Object.fromEntries(
                    Object.entries(costMap)
                        .filter(e => e[1] !== 0)
                        .map(([k, v]) => [`parts.__costMap.${k}`, { $gte: v }]),
                ),
                { $or: notEqual },
            ],
        };
    case '<=':
        return {
            $and: Object.entries(costMap)
                .map(([k, v]) => ({
                    $or: [
                        { [`parts.__costMap.${k}`]: { $lte: v } },
                        { [`parts.__costMap.${k}`]: { $exists: false } },
                    ],
                })),
        };
    case '<':
        return {
            $and: [
                ...Object.entries(costMap)
                    .map(([k, v]) => ({
                        $or: [
                            { [`parts.__costMap.${k}`]: { $lte: v } },
                            { [`parts.__costMap.${k}`]: { $exists: false } },
                        ],
                    })),
                { $or: notEqual },
            ],
        };
    default:
        throw new QueryError({ type: 'invalid-query' });
    }
}

export default function cost(config: {
    id: string;
    alt?: string[];
}): Command<never, false, ':' | '<' | '<=' | '=' | '>' | '>=', '!'> {
    const { id, alt } = config;

    return command({
        id,
        alt,
        allowRegex: false,
        query:      ({ param, op, qual }) => query(param, op, qual),
    });
}

cost.query = query;
