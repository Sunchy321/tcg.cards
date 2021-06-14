/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { QueryError } from '@/search';

import { flatten } from 'lodash';

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
            return {
                parts: { $elemMatch: { cost: { $exists: false } } },
            };
        case '!:':
            return {
                parts: { $elemMatch: { cost: { $exists: true } } },
            };
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

    const costMap: Record<string, number> = {};

    for (const c of costs) {
        if (/^\d+$/.test(c)) {
            costMap[''] = (costMap[''] ?? 0) + Number.parseInt(c);
        } else {
            costMap[c] = (costMap[c] ?? 0) + 1;
        }
    }

    switch (op) {
    case ':':
        return Object.fromEntries(
            Object.entries(costMap)
                .map(([k, v]) => ['parts.__costMap.' + k, k === '' ? v : { $gte: v }]),
        );
    case '!:':
        return {
            $or: flatten(
                Object.entries(costMap)
                    .map(([k, v]) => [
                        { ['parts.__costMap.' + k]: { $lt: v } },
                        { ['parts.__costMap.' + k]: { $exists: false } },
                    ]),
            ),
        };
    case '=':
        return { 'parts.__costMap': costMap };
    case '!=':
        return { 'parts.__costMap': { $ne: costMap } };
    case '>=':
        return Object.fromEntries(
            Object.entries(costMap)
                .map(([k, v]) => ['parts.__costMap.' + k, { $gte: v }]),
        );
    case '>':
        return {
            $and: [
                Object.fromEntries(
                    Object.entries(costMap)
                        .map(([k, v]) => ['parts.__costMap.' + k, { $gte: v }]),
                ),
                { 'parts.__costMap': { $ne: costMap } },
            ],
        };
    case '<':
    case '<=': {
        const symbols = Object.keys(costMap).filter(v => v !== '');

        // a cost {0} always less than any other cost
        symbols.push('0');

        if (costMap[''] != null) {
            symbols.push(
                '1', '2', '3', '4', '5', '6', '7', '8', '9',
                '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
                '1000000',
            );
        }

        return {
            $and: [
                { 'parts.cost': { $exists: true } },

                // cost can only contains specific symbol
                { 'parts.cost': { $not: { $elemMatch: { $nin: symbols } } } },

                // symbol count restriction
                ...Object.entries(costMap).map(([k, v]) => ({
                    $or: [
                        { ['parts.__costMap.' + k]: { $lte: v } },
                        { ['parts.__costMap.' + k]: { $exists: false } },
                    ],
                })),

                ...op === '<' ? [{ 'parts.__costMap': { $ne: costMap } }] : [],
            ],
        };
    }
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}
