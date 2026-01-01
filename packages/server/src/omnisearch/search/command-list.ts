import { cs as create } from '@/search/command';

import * as builtin from '@/search/command/builtin';

import { QueryError } from '@search/command/error';

import { and, arrayContains, eq, gt, gte, inArray, lt, lte, ne, not, notInArray, or, sql } from 'drizzle-orm';

import { toIdentifier } from '@common/util/id';

import { model } from '@model/omnisearch/search';
import { CardView } from '../schema/card';

const cs = create
    .with(model)
    .table([CardView])
    .use(builtin);

export const raw = cs
    .commands.raw
    .handler(({ value }, { table }) => {
        return builtin.text.call({
            column: table => table.name,
            args:   { value, operator: ':', qualifier: [] },
            ctx:    { meta: { multiline: false }, table },
        });
    });

export const name = cs
    .commands.name
    .handler(({ value, operator, qualifier }, { table }) => {
        return builtin.text.call({
            column: table => table.name,
            args:   { value, operator, qualifier },
            ctx:    { meta: { multiline: false }, table },
        });
    });
export const type = cs
    .commands.type
    .handler(({ value, operator, qualifier }, { table }) => {
        return builtin.text.call({
            column: table => table.typeline,
            args:   { value, operator, qualifier },
            ctx:    { meta: { multiline: false }, table },
        });
    });
export const text = cs
    .commands.text
    .handler(({ value, operator, qualifier }, { table }) => {
        return builtin.text.call({
            column: table => table.text,
            args:   { value, operator, qualifier },
            ctx:    { meta: { multiline: true }, table },
        });
    });

export const order = cs
    .commands.order
    .handler(({ value }) => {
        return sql``;
    });
    // .phase('order')
    // .post(({ value }) => {
    //     const parts = value.toLowerCase().split(',').map(v => {
    //         if (v.endsWith('+')) {
    //             return { type: v.slice(0, -1), dir: 'asc' as const };
    //         }

//         if (v.endsWith('-')) {
//             return { type: v.slice(0, -1), dir: 'desc' as const };
//         }

//         return { type: v, dir: 'asc' as const };
//     });

// const order = defineServerCommand({
//     command: commands.order,
//     query(): never { throw new QueryError({ type: 'unreachable' }); },
//     phase:   'order',
//     post:    ({ parameter }) => {
//         const parts = parameter.toLowerCase().split(',').map(v => {
//             if (v.endsWith('+')) {
//                 return { type: v.slice(0, -1), dir: 1 as const };
//             }

//             if (v.endsWith('-')) {
//                 return { type: v.slice(0, -1), dir: -1 as const };
//             }

//             return { type: v, dir: 1 as const };
//         });

//         const sorter: SQL[] = [];

//         for (const { type, dir } of parts) {
//             const func = dir === 1 ? asc : desc;

//             switch (type) {
//             case 'name':
//                 sorter.push(func(CardView.name));
//                 break;
//             case 'id':
//                 sorter.push(func(CardView.cardId));
//                 break;
//             case 'game':
//                 sorter.push(func(CardView.game));
//                 break;
//             default:
//                 throw new QueryError({ type: 'invalid-query' });
//             }
//         }

//         return {
//             type:   'order-by',
//             orders: sorter,
//         };
//     },
// });

// type SearchOption = {
//     page:     number;
//     pageSize: number;
//     lang:     string;
//     orderBy:  string;
// };

// export default defineServerModel({
//     commands: [
//         raw,
//         name,
//         type,
//         text,
//         order,
//     ],

//     actions: {
//         async search(query: SQL, post: PostAction[], options: SearchOption): Promise<NormalResult> {
//             const startTime = Date.now();
//             const { page, pageSize, lang, orderBy } = options;

//             const groupByColumn = [CardView.game, CardView.cardId];

//             const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
//               ?? order.post!({ operator: ':', qualifier: [], parameter: orderBy });

//             const result = await db
//                 .selectDistinctOn([CardView.game, CardView.cardId])
//                 .from(CardView)
//                 .where(query)
//                 .orderBy(
//                     ...groupByColumn,
//                     sql`CASE
//                         WHEN ${CardView.lang} = ${lang} THEN 0
//                         ELSE 1
//                     END`,
//                     ...orderByAction.orders,
//                 )
//                 .limit(pageSize)
//                 .offset((page - 1) * pageSize);

//             // Count the total records matching the same SQL query
//             const countResult = await db
//                 .select({ count: sql`count(distinct (game, card_id))`.as('count') })
//                 .from(CardView)
//                 .where(query);

//             const total = Number(countResult[0]?.count || 0);

//             const totalPage = Math.ceil(total / pageSize);

//             const endTime = Date.now();
//             const elapsed = endTime - startTime;

//             return {
//                 result,
//                 total,
//                 page,
//                 totalPage,
//                 elapsed,
//             };
//         },
//     },
// });
