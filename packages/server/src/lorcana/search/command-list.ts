import { cs as create } from '@/search/command';

import * as builtin from '@/search/command/builtin';

import { and, arrayContains, not, or } from 'drizzle-orm';

import { model } from '@model/lorcana/search';
import { CardPrintView, CardEditorView } from '../schema/print';

const cs = create
    .with(model)
    .table([CardPrintView, CardEditorView])
    .use({ ...builtin });

export const raw = cs
    .commands.raw
    .handler(({ value }, { table }) => {
        // search mana
        if (typeof value === 'string' && /^(\{[^}]+\})+$/.test(value)) {
            return or(
                builtin.text.call({
                    column: table => table.card.text,
                    args:   { value, operator: ':', qualifier: [] },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardLocalization.text,
                    args:   { value, operator: ':', qualifier: [] },
                    ctx:    { meta: { multiline: false }, table },
                }),
            )!;
        } else {
            return or(
                builtin.text.call({
                    column: table => table.card.name,
                    args:   { value, operator: ':', qualifier: [] },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardLocalization.name,
                    args:   { value, operator: ':', qualifier: [] },
                    ctx:    { meta: { multiline: false }, table },
                }),
            )!;
        }
    });

export const fullStats = cs
    .commands.fullStats
    .handler(({ pattern, operator, qualifier }, { table }) => {
        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { cost, strength, willPower } = pattern;

        return (!qualifier?.includes('!') ? and : or)(
            builtin.number.call({
                column: table => table.card.cost,
                args:   { value: cost, operator, qualifier },
                ctx:    { meta: {}, table },
            }),
            builtin.number.call({
                column: table => table.card.strength,
                args:   { value: strength, operator, qualifier },
                ctx:    { meta: {}, table },
            }),
            builtin.number.call({
                column: table => table.card.willPower,
                args:   { value: willPower, operator, qualifier },
                ctx:    { meta: {}, table },
            }),
        )!;
    });

export const stats = cs
    .commands.stats
    .handler(({ pattern, operator, qualifier }, { table }) => {
        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { strength, willPower } = pattern;

        return (!qualifier?.includes('!') ? and : or)(
            builtin.number.call({
                column: table => table.card.strength,
                args:   { value: strength, operator, qualifier },
                ctx:    { meta: {}, table },
            }),
            builtin.number.call({
                column: table => table.card.willPower,
                args:   { value: willPower, operator, qualifier },
                ctx:    { meta: {}, table },
            }),
        )!;
    });

export const hash = cs
    .commands.hash
    .handler(({ value, pattern, qualifier }, { table }) => {
        const tag = pattern?.tag ?? value;

        if (!qualifier.includes('!')) {
            return or(
                arrayContains(table.card.tags, [tag]),
                arrayContains(table.print.printTags, [tag]),
            )!;
        } else {
            return and(
                not(arrayContains(table.card.tags, [tag])),
                not(arrayContains(table.print.printTags, [tag])),
            )!;
        }
    });

export const set = cs
    .commands.set
    .apply(table => table.set, {});

export const number = cs
    .commands.number
    .apply(table => table.number, {});

export const lang = cs
    .commands.lang
    .apply(table => table.lang, {});

export const cost = cs
    .commands.cost
    .apply(table => table.card.cost, {});

export const color = cs
    .commands.color
    .apply(table => table.card.color, {});

export const lore = cs
    .commands.lore
    .apply(table => table.card.lore, {});

export const strength = cs
    .commands.strength
    .apply(table => table.card.strength, {});

export const willPower = cs
    .commands.willPower
    .apply(table => table.card.willPower, {});

export const moveCost = cs
    .commands.moveCost
    .apply(table => table.card.moveCost, {});

export const name = cs
    . commands.name
    .handler(({ modifier, value, operator, qualifier }, { table }) => {
        switch (modifier) {
        case 'unified':
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.call({
                    column: table => table.card.name,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardLocalization.name,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
            )!;
        case 'printed':
            return builtin.text.call({
                column: table => table.print.name,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        default:
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.call({
                    column: table => table.card.name,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardLocalization.name,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
            )!;
        }
    });

export const type = cs
    . commands.type
    .handler(({ modifier, value, operator, qualifier }, { table }) => {
        switch (modifier) {
        case 'unified':
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.call({
                    column: table => table.card.typeline,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardLocalization.typeline,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
            )!;
        case 'printed':
            return builtin.text.call({
                column: table => table.print.typeline,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        default:
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.call({
                    column: table => table.card.typeline,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardLocalization.typeline,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
            )!;
        }
    });

export const text = cs
    . commands.text
    .handler(({ modifier, value, operator, qualifier }, { table }) => {
        switch (modifier) {
        case 'unified':
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.call({
                    column: table => table.card.text,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: true }, table },
                }),
                builtin.text.call({
                    column: table => table.cardLocalization.text,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: true }, table },
                }),
            )!;
        case 'printed':
            return builtin.text.call({
                column: table => table.print.text,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: true }, table },
            });
        default:
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.call({
                    column: table => table.card.text,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: true }, table },
                }),
                builtin.text.call({
                    column: table => table.cardLocalization.text,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: true }, table },
                }),
            )!;
        }
    });

export const flavorText = cs
    .commands.flavorText
    .apply(table => table.print.flavorText, { multiline: true });

export const layout = cs
    .commands.layout
    .apply(table => table.print.layout, {});

export const rarity = cs
    .commands.rarity
    .handler(({ value, operator, qualifier }, { table }) => {
        const rarities = (
            {
                c: 'common',
                u: 'uncommon',
                r: 'rare',
                s: 'super_rare',
                l: 'legendary',
                e: 'enchanted',
            } as Record<string, string>
        )[value] ?? value;

        return builtin.simple.call({
            column: table => table.print.rarity,
            args:   { value: rarities, operator, qualifier },
            ctx:    { meta: { }, table },
        });
    });

// const order = defineServerCommand({
//     command: commands.order,
//     query(): never { throw new QueryError({ type: 'unreachable' }); },
//     phase:   'order',
//     post:    ({ value }) => {
//         const parts = value.toLowerCase().split(',').map(v => {
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
//                 sorter.push(func(CardPrintView.card.name));
//                 break;
//             case 'set':
//             case 'number':
//                 sorter.push(func(CardPrintView.set));
//                 sorter.push(func(CardPrintView.number));
//                 break;
//             case 'date':
//                 sorter.push(func(CardPrintView.print.releaseDate));
//                 break;
//             case 'id':
//                 sorter.push(func(CardPrintView.cardId));
//                 break;
//             case 'cmc':
//             case 'mv':
//             case 'cost':
//                 sorter.push(func(CardPrintView.card.cost));
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
//     lang:     Locale;
//     groupBy:  string;
//     orderBy:  string;
// };

// type DevSearchOption = {
//     pageSize: number;
//     groupBy:  string;
// };

// export default defineServerModel({
//     commands: [
//         raw,
//         stats,
//         fullStats,
//         hash,
//         set,
//         num,
//         lang,
//         cost,
//         color,
//         lore,
//         strength,
//         willPower,
//         moveCost,
//         name,
//         type,
//         text,
//         flavorText,
//         layout,
//         rarity,
//         order,
//     ],

//     actions: {
//         async search(query: SQL, post: PostAction[], options: SearchOption): Promise<NormalResult> {
//             const startTime = Date.now();

//             const { page, pageSize, lang, groupBy, orderBy } = options;

//             const groupByColumn = groupBy === 'card'
//                 ? [CardPrintView.cardId]
//                 : [CardPrintView.cardId, CardPrintView.set, CardPrintView.number];

//             const groupByCount = groupBy === 'card'
//                 ? sql`count(distinct card_id)`.as('count')
//                 : sql`count(distinct (card_id, set, number))`.as('count');

//             const orderByAction = post.find(v => v.type === 'order-by') as OrderBy
//               ?? order!.post!({ operator: ':', qualifier: [], value: orderBy });

//             const result = await db
//                 .selectDistinctOn(groupByColumn)
//                 .from(CardPrintView)
//                 .where(query)
//                 .orderBy(
//                     ...groupByColumn,
//                     sql`CASE
//                         WHEN ${CardPrintView.lang} = ${lang} THEN 0
//                         WHEN ${CardPrintView.lang} = 'en' THEN 1
//                         ELSE 2
//                     END`,
//                     ...orderByAction.orders,
//                 )
//                 .limit(pageSize)
//                 .offset((page - 1) * pageSize);

//             // Count the total records matching the same SQL query
//             const countResult = await db
//                 .select({ count: groupByCount })
//                 .from(CardPrintView)
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

//         async dev(query: SQL, post: PostAction[], options: DevSearchOption): Promise<DevResult> {
//             const startTime = Date.now();

//             const groupBy = options.groupBy;
//             let pageSize = options.pageSize;

//             if (pageSize > 200) {
//                 pageSize = 200;
//             }

//             const groupByColumn = groupBy === 'card'
//                 ? [CardEditorView.cardId]
//                 : groupBy === 'lang'
//                     ? [CardEditorView.cardId, CardEditorView.set, CardEditorView.number]
//                     : [CardEditorView.cardId, CardEditorView.set, CardEditorView.number, CardEditorView.lang];

//             const groupByCount = groupBy === 'card'
//                 ? sql`count(distinct card_id)`.as('count')
//                 : sql`count(distinct (card_id, set, number, lang))`.as('count');

//             const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
//               ?? order.post!({ operator: ':', qualifier: [], value: 'id+' });

//             const result = await db
//                 .selectDistinctOn(groupByColumn)
//                 .from(CardEditorView)
//                 .where(query)
//                 .orderBy(
//                     ...groupByColumn,
//                     sql`CASE
//                         WHEN ${CardEditorView.lang} = ${lang} THEN 0
//                         WHEN ${CardEditorView.lang} = 'en' THEN 1
//                         ELSE 2
//                     END`,
//                     ...orderByAction.orders,
//                 )
//                 .limit(pageSize);

//             // Count the total records matching the same SQL query
//             const countResult = await db
//                 .select({ count: groupByCount })
//                 .from(CardEditorView)
//                 .where(query);

//             const total = Number(countResult[0]?.count || 0);

//             const endTime = Date.now();
//             const elapsed = endTime - startTime;

//             return {
//                 result,
//                 total,
//                 elapsed,
//             };
//         },
//     },
// });
