import { BackendOf, QueryFuncOf, DBQuery } from '@searcher/command/backend';
import { QueryError } from '@searcher/command/error';

import { CostCommand } from '@searcher-data/magic/command/cost';

import { flatten } from 'lodash';

import { specificManaSymbols } from '@static/magic/basic';

export type CostBackendCommand = BackendOf<CostCommand>;

export type CostOption = {
    id: string;
    alt?: string[] | string;
    key?: string;
    allowFloat?: boolean;
};

export type CostQueryOption = Parameters<QueryFuncOf<CostCommand>>[0];

function query(options: CostQueryOption): DBQuery {
    const {
        parameter, operator, qualifier,
    } = options;

    if (parameter === 'null') {
        switch (operator) {
        case ':':
            if (!qualifier.includes('!')) {
                return { 'parts.cost': { $exists: false } };
            } else {
                return { 'parts.cost': { $exists: true } };
            }
        default:
            throw new QueryError({
                type:  'unsupported-operator',
                value: { op: operator, qual: qualifier, param: parameter },
            });
        }
    }

    const costs = parameter
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

    switch (operator) {
    case ':':
        if (!qualifier.includes('!')) {
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
        if (!qualifier.includes('!')) {
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

export default function cost(command: CostCommand): CostBackendCommand {
    return {
        ...command,
        query: args => query(args),
    };
}

cost.query = query;
