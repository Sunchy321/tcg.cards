import { cs as create } from '@/search/command';

import * as builtin from '@/search/command/builtin';

import { and, not, or, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';

import { model } from '@model/hearthstone/search';
import { CardEntityView } from '../schema/entity';

const cs = create
    .with(model)
    .table([CardEntityView])
    .use({ ...builtin });

export const raw = cs
    .commands.raw
    .handler(({ value }, { table }) => {
        return or(
            builtin.text.call({
                column: table => table.localization.name,
                args:   { value, operator: ':', qualifier: [] },
                ctx:    { meta: { multiline: false }, table },

            }),
            builtin.text.call({
                column: table => table.localization.text,
                args:   { value, operator: ':', qualifier: [] },
                ctx:    { meta: { multiline: false }, table },
            }),
        )!;
    });

export const fullStats = cs
    .commands.fullStats
    .handler(({ pattern, operator, qualifier }, { table }) => {
        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { cost, attack, health } = pattern;

        return (!qualifier?.includes('!') ? and : or)(
            builtin.number.call({
                column: table => table.cost,
                args:   { value: cost, operator, qualifier },
                ctx:    { meta: {}, table },
            }),
            builtin.number.call({
                column: table => table.attack,
                args:   { value: attack, operator, qualifier },
                ctx:    { meta: {}, table },
            }),
            builtin.number.call({
                column: table => table.health,
                args:   { value: health, operator, qualifier },
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

        const { attack, health } = pattern;

        return (!qualifier?.includes('!') ? and : or)(
            builtin.number.call({
                column: table => table.attack,
                args:   { value: attack, operator, qualifier },
                ctx:    { meta: {}, table },
            }),
            builtin.number.call({
                column: table => table.health,
                args:   { value: health, operator, qualifier },
                ctx:    { meta: {}, table },
            }),
        )!;
    });

export const hash = cs
    .commands.hash
    .handler(({ value, pattern, qualifier }, { table }) => {
        const tag = pattern?.tag ?? value;

        const match = /^(.*?)[:=](.*)$/.exec(tag);

        const escape = (text: string) => text.replace(/[%_|*+?{}()[\]]/g, '\\$&');

        const tester = (column: PgColumn) => match == null
            ? sql`exists (select 1 from unnest(${column}) as value where value similar to ${`${escape(tag)}|${escape(tag)}:%`})`
            : sql`exists (select 1 from unnest(${column}) as value where value similar to ${`${escape(match[1])}:${escape(match[2])}`})`;

        if (!qualifier.includes('!')) {
            return or(
                tester(table.mechanics),
                tester(table.referencedTags),
            )!;
        } else {
            return and(
                not(tester(table.mechanics)),
                not(tester(table.referencedTags)),
            )!;
        }
    });

export const lang = cs
    .commands.lang
    .apply(table => table.lang, { });

export const name = cs
    .commands.name
    .apply(table => table.localization.name, { multiline: false });

export const text = cs
    .commands.text
    .apply(table => table.localization.text, { multiline: true });

export const flavorText = cs
    .commands.flavorText
    .apply(table => table.localization.flavorText, { multiline: true });

export const set = cs
    .commands.set
    .apply(table => table.set, { });

export const classes = cs
    .commands.classes
    .apply(table => table.classes, { });

export const type = cs
    .commands.type
    .apply(table => table.type, { });

export const cost = cs
    .commands.cost
    .apply(table => table.cost, { });

export const attack = cs
    .commands.attack
    .apply(table => table.attack, { });

export const health = cs
    .commands.health
    .apply(table => table.health, { });

export const durability = cs
    .commands.durability
    .apply(table => table.durability, { });

export const armor = cs
    .commands.armor
    .apply(table => table.armor, { });

export const rune = cs
    .commands.rune
    .apply(table => table.rune, { });

export const race = cs
    .commands.race
    .apply(table => table.race, { });

export const spellSchool = cs
    .commands.spellSchool
    .apply(table => table.spellSchool, { });

export const techLevel = cs
    .commands.techLevel
    .apply(table => table.techLevel, { });

export const raceBucket = cs
    .commands.raceBucket
    .apply(table => table.raceBucket, { });

export const mercenaryRole = cs
    .commands.mercenaryRole
    .apply(table => table.mercenaryRole, { });

export const mercenaryFaction = cs
    .commands.mercenaryFaction
    .apply(table => table.mercenaryFaction, { });

export const rarity = cs
    .commands.rarity
    .apply(table => table.rarity, { });

export const artist = cs
    .commands.artist
    .apply(table => table.artist, { multiline: false });

// export const order = cs
// .commands.order,
//    .handler((): never { throw new QueryError({ type: 'unreachable' }); },
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
//                 sorter.push(func(CardEntityView.localization.name));
//                 break;
//             case 'id':
//                 sorter.push(func(CardEntityView.cardId));
//                 break;
//             case 'cost':
//                 sorter.push(func(CardEntityView.cost));
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

// export default defineServerModel({
//     commands: [
//         raw,
//         fullStats,
//         stats,
//         hash,
//         lang,
//         name,
//         text,
//         flavorText,
//         set,
//         classes,
//         type,
//         cost,
//         attack,
//         health,
//         durability,
//         armor,
//         rune,
//         race,
//         spellSchool,
//         techLevel,
//         raceBucket,
//         mercenaryRole,
//         mercenaryFaction,
//         rarity,
//         artist,
//         order,
//     ],

//     actions: {
//         async search(handler( SQL, post: PostAction[], options: SearchOption): Promise<NormalResult> {
//             const startTime = Date.now();
//             const { page, pageSize, lang, groupBy, orderBy } = options;

//             const groupByColumn = groupBy === 'card'
//                 ? [CardEntityView.cardId]
//                 : [CardEntityView.cardId];

//             const groupByCount = groupBy === 'card'
//                 ? sql`count(distinct card_id)`.as('count')
//                 : sql`count(distinct (card_id, set, number, lang))`.as('count');

//             const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
//               ?? order.post!({ operator: ':', qualifier: [], value: orderBy });

//             const result = await db
//                 .selectDistinctOn(groupByColumn)
//                 .from(CardEntityView)
//                 .where(and(
//                     eq(CardEntityView.isLatest, true),
//                     eq(CardEntityView.lang, lang),
//                    .handler(,
//                 ))
//                 .orderBy(
//                     ...groupByColumn,
//                     ...orderByAction.orders,
//                 )
//                 .limit(pageSize)
//                 .offset((page - 1) * pageSize);

//             // Count the total records matching the same SQL.handler(
//             const countResult = await db
//                 .select({ count: groupByCount })
//                 .from(CardEntityView)
//                 .where(and(
//                     eq(CardEntityView.isLatest, true),
//                     eq(CardEntityView.lang, lang),
//                    .handler(,
//                 ));

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
