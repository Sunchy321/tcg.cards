// import { and, arrayContains, SQL, asc, desc, eq, gt, gte, inArray, lt, lte, ne, not, notInArray, or, sql } from 'drizzle-orm';

// import { QueryError } from '@search/command/error';
// import { OrderBy, PostAction, defineServerCommand } from '@/search/command';
// import { DevResult, NormalResult } from '@model/magic/schema/search';
// import { Locale } from '@model/magic/schema/basic';

// import { defineServerModel } from '@/search/model';
// import { toIdentifier } from '@common/util/id';

// import { db } from '@/drizzle';
// import { CardEditorView, CardPrintView } from '../schema/print';

// import * as builtin from '@/search/command/builtin';
// import * as magic from './command';

// import { commands } from '@model/magic/search';

// const raw = defineServerCommand({
//     command: commands.raw,
//     query:   ({ parameter }) => {
//         // search mana
//         if (typeof parameter === 'string' && /^(\{[^}]+\})+$/.test(parameter)) {
//             return or(
//                 builtin.text.query({
//                     column:    CardPrintView.cardPart.text,
//                     multiline: false,
//                     parameter,
//                     operator:  ':',
//                     qualifier: [],
//                 }),
//                 builtin.text.query({
//                     column:    CardPrintView.cardPartLocalization.text,
//                     multiline: false,
//                     parameter,
//                     operator:  ':',
//                     qualifier: [],
//                 }),
//                 magic.cost.query({
//                     column:     CardPrintView.cardPart.cost,
//                     costMapCol: CardPrintView.cardPart.cost,
//                     parameter,
//                     operator:   ':',
//                     qualifier:  [] as '!'[],
//                 }),
//             )!;
//         } else {
//             return or(
//                 builtin.text.query({
//                     column:    CardPrintView.cardPart.name,
//                     multiline: false,
//                     parameter,
//                     operator:  ':',
//                     qualifier: [],
//                 }),
//                 builtin.text.query({
//                     column:    CardPrintView.cardPartLocalization.name,
//                     multiline: false,
//                     parameter,
//                     operator:  ':',
//                     qualifier: [],
//                 }),
//             )!;
//         }
//     },
// });

// const stats = defineServerCommand({
//     command: commands.stats,

//     query({ pattern, operator, qualifier }) {
//         if (pattern == null) {
//             throw new QueryError({ type: 'invalid-query' });
//         }

//         if (operator === '') {
//             operator = '=';
//         }

//         const { power, toughness } = pattern;

//         if (qualifier?.includes('!')) {
//             return or(
//                 magic.numeric.query({
//                     column:    CardPrintView.cardPart.power,
//                     parameter: power,
//                     operator:  operator ?? '=',
//                     qualifier,
//                 }),
//                 magic.numeric.query({
//                     column:    CardPrintView.cardPart.toughness,
//                     parameter: toughness,
//                     operator:  operator ?? '=',
//                     qualifier,
//                 }),
//             )!;
//         } else {
//             return and(
//                 magic.numeric.query({
//                     column:    CardPrintView.cardPart.power,
//                     parameter: power,
//                     operator:  operator ?? '=',
//                     qualifier: qualifier ?? [],
//                 }),
//                 magic.numeric.query({
//                     column:    CardPrintView.cardPart.toughness,
//                     parameter: toughness,
//                     operator:  operator ?? '=',
//                     qualifier: qualifier ?? [],
//                 }),
//             )!;
//         }
//     },
// });

// const hash = defineServerCommand({
//     command: commands.hash,
//     query({ pattern, qualifier }) {
//         if (pattern == null) {
//             throw new QueryError({ type: 'invalid-query' });
//         }

//         const { tag } = pattern;

//         if (!qualifier.includes('!')) {
//             return or(
//                 arrayContains(CardPrintView.card.tags, [tag]),
//                 arrayContains(CardPrintView.print.printTags, [tag]),
//             )!;
//         } else {
//             return and(
//                 not(arrayContains(CardPrintView.card.tags, [tag])),
//                 not(arrayContains(CardPrintView.print.printTags, [tag])),
//             )!;
//         }
//     },
// });

// const set = builtin.simple(commands.set, { column: CardPrintView.set });
// const num = builtin.simple(commands.num, { column: CardPrintView.number });
// const lang = builtin.simple(commands.lang, { column: CardPrintView.lang });

// const cost = magic.cost(commands.cost, {
//     column:     CardPrintView.cardPart.cost,
//     costMapCol: CardPrintView.cardPart.cost,
// });

// const manaValue = builtin.number(commands.manaValue, { column: CardPrintView.card.manaValue });

// const color = builtin.bit(commands.color, { column: CardPrintView.cardPart.color });
// const colorIdentity = builtin.bit(commands.colorIdentity, { column: CardPrintView.card.colorIdentity });
// const colorIndicator = builtin.bit(commands.colorIndicator, { column: CardPrintView.cardPart.colorIndicator });

// const power = magic.numeric(commands.power, { column: CardPrintView.cardPart.power });
// const toughness = magic.numeric(commands.toughness, { column: CardPrintView.cardPart.toughness });

// const loyalty = defineServerCommand({
//     command: commands.loyalty,
//     query({
//         pattern, parameter, operator, qualifier,
//     }) {
//         return magic.numeric.query({
//             column:    CardPrintView.cardPart.loyalty,
//             parameter: pattern?.loyalty ?? parameter,
//             operator:  operator === '' ? '=' : operator,
//             qualifier: qualifier ?? [],
//         });
//     },
// });

// const defense = defineServerCommand({
//     command: commands.defense,
//     query({
//         pattern, parameter, operator, qualifier,
//     }) {
//         return magic.numeric.query({
//             column:    CardPrintView.cardPart.defense,
//             parameter: pattern?.defense ?? parameter,
//             operator:  operator === '' ? '=' : operator,
//             qualifier,
//         });
//     },
// });

// const name = defineServerCommand({
//     command: commands.name,
//     query({
//         modifier, parameter, operator, qualifier,
//     }) {
//         switch (modifier) {
//         case 'oracle':
//             return builtin.text.query({
//                 column: CardPrintView.cardPart.name, parameter, operator, qualifier, multiline: false,
//             });
//         case 'unified':
//             return builtin.text.query({
//                 column: CardPrintView.cardPartLocalization.name, parameter, operator, qualifier, multiline: false,
//             });
//         case 'printed':
//             return builtin.text.query({
//                 column: CardPrintView.printPart.name, parameter, operator, qualifier, multiline: false,
//             });
//         default:
//             return (!qualifier.includes('!') ? or : and)(
//                 builtin.text.query({
//                     column:    CardPrintView.cardPart.name,
//                     parameter, operator, qualifier, multiline: false,
//                 }),
//                 builtin.text.query({
//                     column:    CardPrintView.cardPartLocalization.name,
//                     parameter, operator, qualifier, multiline: false,
//                 }),
//             )!;
//         }
//     },
// });

// const type = defineServerCommand({
//     command: commands.type,
//     query({
//         modifier, parameter, operator, qualifier,
//     }) {
//         switch (modifier) {
//         case 'oracle':
//             return builtin.text.query({
//                 column: CardPrintView.cardPart.typeline, parameter, operator, qualifier, multiline: false,
//             });
//         case 'unified':
//             return builtin.text.query({
//                 column: CardPrintView.cardPartLocalization.typeline, parameter, operator, qualifier, multiline: false,
//             });
//         case 'printed':
//             return builtin.text.query({
//                 column: CardPrintView.printPart.typeline, parameter, operator, qualifier, multiline: false,
//             });
//         default:
//             if (!qualifier.includes('!')) {
//                 return or(
//                     builtin.text.query({
//                         column:    CardPrintView.cardPart.typeline,
//                         parameter, operator, qualifier, multiline: false,
//                     }),
//                     builtin.text.query({
//                         column:    CardPrintView.cardPartLocalization.typeline,
//                         parameter, operator, qualifier, multiline: false,
//                     }),
//                 )!;
//             } else {
//                 return and(
//                     not(builtin.text.query({
//                         column:    CardPrintView.cardPart.typeline,
//                         parameter, operator, qualifier, multiline: false,
//                     })),
//                     not(builtin.text.query({
//                         column:    CardPrintView.cardPartLocalization.typeline,
//                         parameter, operator, qualifier, multiline: false,
//                     })),
//                 )!;
//             }
//         }
//     },
// });

// const text = defineServerCommand({
//     command: commands.text,
//     query({
//         modifier, parameter, operator, qualifier,
//     }) {
//         switch (modifier) {
//         case 'oracle':
//             return builtin.text.query({
//                 column: CardPrintView.cardPart.text, parameter, operator, qualifier, multiline: true,
//             });
//         case 'unified':
//             return builtin.text.query({
//                 column: CardPrintView.cardPartLocalization.text, parameter, operator, qualifier, multiline: true,
//             });
//         case 'printed':
//             return builtin.text.query({
//                 column: CardPrintView.printPart.text, parameter, operator, qualifier, multiline: true,
//             });
//         default:
//             if (!qualifier.includes('!')) {
//                 return or(
//                     builtin.text.query({
//                         column:    CardPrintView.cardPart.text,
//                         parameter, operator, qualifier, multiline: true,
//                     }),
//                     builtin.text.query({
//                         column:    CardPrintView.cardPartLocalization.text,
//                         parameter, operator, qualifier, multiline: true,
//                     }),
//                 )!;
//             } else {
//                 return and(
//                     not(builtin.text.query({
//                         column:    CardPrintView.cardPart.text,
//                         parameter, operator, qualifier, multiline: true,
//                     })),
//                     not(builtin.text.query({
//                         column:    CardPrintView.cardPartLocalization.text,
//                         parameter, operator, qualifier, multiline: true,
//                     })),
//                 )!;
//             }
//         }
//     },
// });

// const oracle = defineServerCommand({
//     command: commands.oracle,
//     query:   ({ parameter, operator, qualifier }) => {
//         if (!qualifier.includes('!')) {
//             return or(
//                 builtin.text.query({
//                     column: CardPrintView.cardPart.text, parameter, operator, qualifier, multiline: true,
//                 }),
//                 builtin.text.query({
//                     column: CardPrintView.cardPartLocalization.text, parameter, operator, qualifier, multiline: true,
//                 }),
//             )!;
//         } else {
//             return and(
//                 not(builtin.text.query({
//                     column: CardPrintView.cardPart.text, parameter, operator, qualifier, multiline: true,
//                 })),
//                 not(builtin.text.query({
//                     column: CardPrintView.cardPartLocalization.text, parameter, operator, qualifier, multiline: true,
//                 })),
//             )!;
//         }
//     },
// });

// const flavorText = builtin.text(commands.flavorText, { column: CardPrintView.printPart.flavorText, multiline: true });
// const flavorName = builtin.text(commands.flavorName, { column: CardPrintView.printPart.flavorName, multiline: false });
// const layout = builtin.simple(commands.layout, { column: CardPrintView.print.layout });
// const imageStatus = builtin.simple(commands.imageStatus, { column: CardPrintView.print.imageStatus });

// const rarity = defineServerCommand({
//     command: commands.rarity,
//     query:   ({ parameter, operator, qualifier }) => {
//         const rarities = (
//             {
//                 c: 'common',
//                 u: 'uncommon',
//                 r: 'rare',
//                 m: 'mythic',
//                 s: 'special',
//             } as Record<string, string>
//         )[parameter] ?? parameter;

//         return builtin.simple.query({
//             column: CardPrintView.print.rarity, parameter: rarities, operator, qualifier,
//         });
//     },
// });

// const date = defineServerCommand({
//     command: commands.date,
//     query:   ({ parameter, operator, qualifier }) => {
//         switch (operator) {
//         case '=':
//         case ':':
//             if (!qualifier.includes('!')) {
//                 return eq(CardPrintView.print.releaseDate, parameter);
//             } else {
//                 return ne(CardPrintView.print.releaseDate, parameter);
//             }
//         case '>':
//             return gt(CardPrintView.print.releaseDate, parameter);
//         case '>=':
//             return gte(CardPrintView.print.releaseDate, parameter);
//         case '<':
//             return lt(CardPrintView.print.releaseDate, parameter);
//         case '<=':
//             return lte(CardPrintView.print.releaseDate, parameter);
//         default:
//             throw new QueryError({ type: 'invalid-query' });
//         }
//     },
// });

// const format = defineServerCommand({
//     command: commands.format,
//     query:   ({ parameter, qualifier }) => {
//         if (parameter.includes(',')) {
//             const [format, status] = parameter.split('=');

//             if (!qualifier.includes('!')) {
//                 return eq(sql`${CardPrintView.card.legalities} ->> ${format}`, status);
//             } else {
//                 return ne(sql`${CardPrintView.card.legalities} ->> ${format}`, status);
//             }
//         } else {
//             if (!qualifier.includes('!')) {
//                 return inArray(sql`${CardPrintView.card.legalities} ->> ${parameter}`, ['legal', 'restricted']);
//             } else {
//                 return notInArray(sql`${CardPrintView.card.legalities} ->> ${parameter}`, ['legal', 'restricted']);
//             }
//         }
//     },
// });

// const counter = defineServerCommand({
//     command: commands.counter,
//     query:   ({ parameter, qualifier }) => {
//         parameter = toIdentifier(parameter);

//         if (!qualifier.includes('!')) {
//             return arrayContains(CardPrintView.card.counters, [parameter]);
//         } else {
//             return not(arrayContains(CardPrintView.card.counters, [parameter]));
//         }
//     },
// });

// const keyword = defineServerCommand({
//     command: commands.keyword,
//     query:   ({ parameter, qualifier }) => {
//         parameter = toIdentifier(parameter);

//         if (!qualifier.includes('!')) {
//             return arrayContains(CardPrintView.card.keywords, [parameter]);
//         } else {
//             return not(arrayContains(CardPrintView.card.keywords, [parameter]));
//         }
//     },
// });

// const multiverseId = defineServerCommand({
//     command: commands.multiverseId,
//     query:   ({ parameter, qualifier }) => {
//         if (parameter === '*') {
//             if (!qualifier.includes('!')) {
//                 return gt(sql`array_length(${CardPrintView.print.multiverseId}, 1)`, 0);
//             } else {
//                 return eq(sql`array_length(${CardPrintView.print.multiverseId}, 1)`, 0);
//             }
//         } else {
//             const num = Number.parseInt(parameter, 10);

//             if (Number.isNaN(num)) {
//                 throw new QueryError({ type: 'invalid-query' });
//             }

//             if (!qualifier.includes('!')) {
//                 return arrayContains(CardPrintView.print.multiverseId, [num]);
//             } else {
//                 return not(arrayContains(CardPrintView.print.multiverseId, [num]));
//             }
//         }
//     },
// });

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
//                 sorter.push(func(CardPrintView.card.manaValue));
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
//         hash,
//         set,
//         num,
//         lang,
//         cost,
//         manaValue,
//         color,
//         colorIdentity,
//         colorIndicator,
//         power,
//         toughness,
//         loyalty,
//         defense,
//         name,
//         type,
//         text,
//         oracle,
//         flavorText,
//         flavorName,
//         layout,
//         imageStatus,
//         rarity,
//         date,
//         format,
//         counter,
//         keyword,
//         multiverseId,
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

//             const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
//               ?? order.post!({ operator: ':', qualifier: [], parameter: orderBy });

//             const result = await db
//                 .selectDistinctOn(groupByColumn)
//                 .from(CardPrintView)
//                 .where(query)
//                 .orderBy(
//                     ...groupByColumn,
//                     CardPrintView.partIndex,
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
//                     ? [CardEditorView.cardId, CardEditorView.set, CardEditorView.number, CardEditorView.partIndex]
//                     : [CardEditorView.cardId, CardEditorView.set, CardEditorView.number, CardEditorView.lang, CardEditorView.partIndex];

//             const groupByCount = groupBy === 'card'
//                 ? sql`count(distinct card_id)`.as('count')
//                 : sql`count(distinct (card_id, set, number, lang))`.as('count');

//             const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
//               ?? order.post!({ operator: ':', qualifier: [], parameter: 'id+' });

//             const result = await db
//                 .selectDistinctOn(groupByColumn)
//                 .from(CardEditorView)
//                 .where(query)
//                 .orderBy(
//                     ...groupByColumn,
//                     CardEditorView.partIndex,
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

import './model';
