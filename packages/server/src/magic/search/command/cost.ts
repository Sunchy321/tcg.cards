import { ca } from '@/search/command/adapter';

import { cost as costSchema } from '@model/magic/search/command/cost';

import { QueryError } from '@search/command/error';

import { Column, isNotNull, isNull } from 'drizzle-orm';

import { specificManaSymbols } from '@static/magic/basic';

export const cost = ca
    .adapt(costSchema)
    .$meta<{ getCostMapCol: <Table>(table: Table) => Column }>()
    .handler(({ value, operator, qualifier }, { meta, column, table }) => {
        const { getCostMapCol } = meta;

        const costMapCol = getCostMapCol(table);

        // const mapKey = key.replace(/\bcost\b/, '__costMap');

        if (value === 'null') {
            switch (operator) {
            case ':':
                if (!qualifier.includes('!')) {
                    return isNull(column);
                } else {
                    return isNotNull(column);
                }
            default:
                throw new QueryError({
                    type:    'unsupported-operator',
                    payload: { op: operator, qual: qualifier, param: value },
                });
            }
        }

        const costs = value
            .toUpperCase()
            .split(/\{([^{}]*)\}|(\d{2,})|(H[WR1])|(.(?:\/.)?)/)
            .filter(v => v !== '' && v != null);

        const costMap = Object.fromEntries(
            ['<generic>', ...specificManaSymbols].map(s => [s, 0]),
        );

        for (const c of costs) {
            if (/^\d+$/.test(c)) {
                costMap['<generic>'] += Number.parseInt(c, 10);
            } else {
                costMap[c] += 1;
            }
        }

        // const notEqual = Object.entries(costMap)
        //     .map(([k, v]) => {
        //         if (v !== 0) {
        //             return { [`${mapKey}.${k}`]: { $ne: v } };
        //         } else {
        //             return { [`${mapKey}.${k}`]: { $exists: true, $ne: 0 } };
        //         }
        //     });

        switch (operator) {
        // case ':':
        //     if (!qualifier.includes('!')) {
        //         return Object.fromEntries(
        //             Object.entries(costMap)
        //                 .filter(e => e[1] !== 0)
        //                 .map(([k, v]) => [`${mapKey}.${k}`, k === '' ? v : { $gte: v }]),
        //         );
        //     } else {
        //         return {
        //             $or: flatten(
        //                 Object.entries(costMap)
        //                     .filter(e => e[1] !== 0)
        //                     .map(([k, v]) => [
        //                         { [`${mapKey}.${k}`]: { $lt: v } },
        //                         { [`${mapKey}.${k}`]: { $exists: false } },
        //                     ]),
        //             ),
        //         };
        //     }
        // case '=':
        //     if (!qualifier.includes('!')) {
        //         return {
        //             $and: [
        //                 { [key]: { $exists: true } },
        //                 ...Object.entries(costMap)
        //                     .map(([k, v]) => (v === 0
        //                         ? {
        //                             $or: [
        //                                 { [`${mapKey}.${k}`]: 0 },
        //                                 { [`${mapKey}.${k}`]: { $exists: false } },
        //                             ],
        //                         }
        //                         : { [`${mapKey}.${k}`]: v })),
        //             ],
        //         };
        //     } else {
        //         return {
        //             $or: [
        //                 { [key]: { $exists: false } },
        //                 ...notEqual,
        //             ],
        //         };
        //     }
        // case '>=':
        //     return Object.fromEntries(
        //         Object.entries(costMap)
        //             .filter(e => e[1] !== 0)
        //             .map(([k, v]) => [`${mapKey}.${k}`, { $gte: v }]),
        //     );
        // case '>':
        //     return {
        //         $and: [
        //             Object.fromEntries(
        //                 Object.entries(costMap)
        //                     .filter(e => e[1] !== 0)
        //                     .map(([k, v]) => [`${mapKey}.${k}`, { $gte: v }]),
        //             ),
        //             { $or: notEqual },
        //         ],
        //     };
        // case '<=':
        //     return {
        //         $and: Object.entries(costMap)
        //             .map(([k, v]) => ({
        //                 $or: [
        //                     { [`${mapKey}.${k}`]: { $lte: v } },
        //                     { [`${mapKey}.${k}`]: { $exists: false } },
        //                 ],
        //             })),
        //     };
        // case '<':
        //     return {
        //         $and: [
        //             ...Object.entries(costMap)
        //                 .map(([k, v]) => ({
        //                     $or: [
        //                         { [`${mapKey}.${k}`]: { $lte: v } },
        //                         { [`${mapKey}.${k}`]: { $exists: false } },
        //                     ],
        //                 })),
        //             { $or: notEqual },
        //         ],
        //     };
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    });
