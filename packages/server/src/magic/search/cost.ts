/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { QueryError } from '@/search';

import { flatten } from 'lodash';

import { specificManaSymbols } from '@data/magic/basic';

export default function costQuery(
    param: string | RegExp,
    op: string | undefined,
) {
    if (param instanceof RegExp) {
        throw new QueryError({
            type:  'regex/disabled',
            value: op || '',
        });
    }

    if (param === 'null') {
        switch (op) {
        case ':':
            return { 'parts.cost': { $exists: false } };
        case '!:':
            return { 'parts.cost': { $exists: true } };
        default:
            throw new QueryError({
                type:  'operator/unsupported',
                value: op || '',
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
            costMap[''] += Number.parseInt(c);
        } else {
            costMap[c]++;
        }
    }

    const notEqual = Object.entries(costMap)
        .map(([k, v]) => {
            if (v !== 0) {
                return { ['parts.__costMap.' + k]: { $ne: v } };
            } else {
                return { ['parts.__costMap.' + k]: { $exists: true, $ne: 0 } };
            }
        });

    switch (op) {
    case ':':
        return Object.fromEntries(
            Object.entries(costMap)
                .filter(e => e[1] !== 0)
                .map(([k, v]) => ['parts.__costMap.' + k, k === '' ? v : { $gte: v }]),
        );
    case '!:':
        return {
            $or: flatten(
                Object.entries(costMap)
                    .filter(e => e[1] !== 0)
                    .map(([k, v]) => [
                        { ['parts.__costMap.' + k]: { $lt: v } },
                        { ['parts.__costMap.' + k]: { $exists: false } },
                    ]),
            ),
        };
    case '=':
        return Object.fromEntries(
            Object.entries(costMap)
                .map(([k, v]) => ['parts.__costMap.' + k, v]),
        );
    case '!=':
        return {
            $or: [
                { 'parts.cost': { $exists: false } },
                ...notEqual,
            ],
        };
    case '>=':
        return Object.fromEntries(
            Object.entries(costMap)
                .filter(e => e[1] !== 0)
                .map(([k, v]) => ['parts.__costMap.' + k, { $gte: v }]),
        );
    case '>':
        return {
            $and: [
                Object.fromEntries(
                    Object.entries(costMap)
                        .filter(e => e[1] !== 0)
                        .map(([k, v]) => ['parts.__costMap.' + k, { $gte: v }]),
                ),
                { $or: notEqual },
            ],
        };
    case '<=':
        return {
            $and: Object.entries(costMap)
                .map(([k, v]) => ({
                    $or: [
                        { ['parts.__costMap.' + k]: { $lte: v } },
                        { ['parts.__costMap.' + k]: { $exists: false } },
                    ],
                })),
        };
    case '<':
        return {
            $and: [
                ...Object.entries(costMap)
                    .map(([k, v]) => ({
                        $or: [
                            { ['parts.__costMap.' + k]: { $lte: v } },
                            { ['parts.__costMap.' + k]: { $exists: false } },
                        ],
                    })),
                { $or: notEqual },
            ],
        };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}
