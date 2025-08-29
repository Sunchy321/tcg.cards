import { and, arrayContains, asc, desc, not, or, SQL, sql } from 'drizzle-orm';

import { defineServerModel } from '@/search/model';

import { QueryError } from '@search/command/error';
import { OrderBy, PostAction, defineServerCommand } from '@/search/command';

import { DevResult, NormalResult } from '@model/lorcana/schema/search';
import { Locale } from '@model/lorcana/schema/basic';

import * as builtin from '@/search/command/builtin';

import _ from 'lodash';

import { db } from '@/drizzle';
import { CardEditorView, CardPrintView } from '../schema/print';

import { commands } from '@model/lorcana/search';

const raw = defineServerCommand({
    command: commands.raw,
    query:   ({ parameter }) => {
        // search mana
        if (typeof parameter === 'string' && /^(\{[^}]+\})+$/.test(parameter)) {
            return or(
                builtin.text.query({
                    column:    CardPrintView.card.text,
                    multiline: false,
                    parameter,
                    operator:  ':',
                    qualifier: [],
                }),
                builtin.text.query({
                    column:    CardPrintView.cardLocalization.text,
                    multiline: false,
                    parameter,
                    operator:  ':',
                    qualifier: [],
                }),
                builtin.text.query({
                    column:    CardPrintView.print.text,
                    multiline: false,
                    parameter,
                    operator:  ':',
                    qualifier: [],
                }),
            )!;
        } else {
            return or(
                builtin.text.query({
                    column:    CardPrintView.card.name,
                    multiline: false,
                    parameter,
                    operator:  ':',
                    qualifier: [],
                }),
                builtin.text.query({
                    column:    CardPrintView.cardLocalization.name,
                    multiline: false,
                    parameter,
                    operator:  ':',
                    qualifier: [],
                }),
            )!;
        }
    },
});

const stats = defineServerCommand({
    command: commands.stats,

    query({ pattern, operator, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { strength, willPower } = pattern;

        if (!qualifier?.includes('!')) {
            return and(
                builtin.number.query({
                    column:    CardPrintView.card.strength,
                    parameter: strength,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardPrintView.card.willPower,
                    parameter: willPower,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            )!;
        } else {
            return or(
                builtin.number.query({
                    column:    CardPrintView.card.strength,
                    parameter: strength,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardPrintView.card.willPower,
                    parameter: willPower,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            )!;
        }
    },
});

const fullStats = defineServerCommand({
    command: commands.fullStats,

    query({ pattern, operator, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { cost, strength, willPower } = pattern;

        if (!qualifier?.includes('!')) {
            return and(
                builtin.number.query({
                    column:    CardPrintView.card.cost,
                    parameter: cost,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardPrintView.card.strength,
                    parameter: strength,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardPrintView.card.willPower,
                    parameter: willPower,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            )!;
        } else {
            return or(
                builtin.number.query({
                    column:    CardPrintView.card.cost,
                    parameter: cost,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardPrintView.card.strength,
                    parameter: strength,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardPrintView.card.willPower,
                    parameter: willPower,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            )!;
        }
    },
});

const hash = defineServerCommand({
    command: commands.hash,
    query({ pattern, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        const { tag } = pattern;

        if (!qualifier.includes('!')) {
            return or(
                arrayContains(CardPrintView.card.tags, [tag]),
                arrayContains(CardPrintView.print.printTags, [tag]),
            )!;
        } else {
            return and(
                not(arrayContains(CardPrintView.card.tags, [tag])),
                not(arrayContains(CardPrintView.print.printTags, [tag])),
            )!;
        }
    },
});

const set = builtin.simple(commands.set, { column: CardPrintView.set });
const num = builtin.simple(commands.num, { column: CardPrintView.number });
const lang = builtin.simple(commands.lang, { column: CardPrintView.lang });

const cost = builtin.number(commands.cost, { column: CardPrintView.card.cost });

const color = builtin.simpleSet(commands.color, { column: CardPrintView.card.color });

const lore = builtin.number(commands.lore, { column: CardPrintView.card.lore });
const strength = builtin.number(commands.strength, { column: CardPrintView.card.strength });
const willPower = builtin.number(commands.willPower, { column: CardPrintView.card.willPower });
const moveCost = builtin.number(commands.moveCost, { column: CardPrintView.card.moveCost });

const name = defineServerCommand({
    command: commands.name,
    query({
        modifier, parameter, operator, qualifier,
    }) {
        switch (modifier) {
        case 'unified':
            return builtin.text.query({
                column:    CardPrintView.cardLocalization.name,
                parameter,
                operator,
                qualifier,
                multiline: false,
            });
        case 'printed':
            return builtin.text.query({
                column:    CardPrintView.print.name,
                parameter,
                operator,
                qualifier,
                multiline: false,
            });
        default:
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.query({
                    column:    CardPrintView.card.name,
                    parameter,
                    operator,
                    qualifier,
                    multiline: false,
                }),
                builtin.text.query({
                    column:    CardPrintView.cardLocalization.name,
                    parameter,
                    operator,
                    qualifier,
                    multiline: false,
                }),
            )!;
        }
    },
});

const type = defineServerCommand({
    command: commands.type,
    query({
        modifier, parameter, operator, qualifier,
    }) {
        switch (modifier) {
        case 'unified':
            return builtin.text.query({
                column:    CardPrintView.cardLocalization.typeline,
                parameter,
                operator,
                qualifier,
                multiline: false,
            });
        case 'printed':
            return builtin.text.query({
                column:    CardPrintView.print.typeline,
                parameter,
                operator,
                qualifier,
                multiline: false,
            });
        default:
            return builtin.text.query({
                column:    CardPrintView.cardLocalization.typeline,
                parameter,
                operator,
                qualifier,
                multiline: false,
            });
        }
    },
});

const text = defineServerCommand({
    command: commands.text,
    query({
        modifier, parameter, operator, qualifier,
    }) {
        switch (modifier) {
        case 'unified':
            return builtin.text.query({
                column:    CardPrintView.cardLocalization.text,
                parameter,
                operator,
                qualifier,
                multiline: true,
            });
        case 'printed':
            return builtin.text.query({
                column:    CardPrintView.print.text,
                parameter,
                operator,
                qualifier,
                multiline: true,
            });
        default:
            return builtin.text.query({
                column:    CardPrintView.cardLocalization.text,
                parameter,
                operator,
                qualifier,
                multiline: true,
            });
        }
    },
});

const flavorText = builtin.text(commands.flavorText, { column: CardPrintView.print.flavorText, multiline: true });
const layout = builtin.simple(commands.layout, { column: CardPrintView.print.layout });

const rarity = defineServerCommand({
    command: commands.rarity,
    query:   ({ parameter, operator, qualifier }) => {
        const rarities = (
            {
                c: 'common',
                u: 'uncommon',
                r: 'rare',
                s: 'super_rare',
                l: 'legendary',
                e: 'enchanted',
            } as Record<string, string>
        )[parameter] ?? parameter;

        return builtin.simple.query({
            column:    CardPrintView.print.rarity,
            parameter: rarities,
            operator,
            qualifier,
        });
    },
});

const order = defineServerCommand({
    command: commands.order,
    query(): never { throw new QueryError({ type: 'unreachable' }); },
    phase:   'order',
    post:    ({ parameter }) => {
        const parts = parameter.toLowerCase().split(',').map(v => {
            if (v.endsWith('+')) {
                return { type: v.slice(0, -1), dir: 1 as const };
            }

            if (v.endsWith('-')) {
                return { type: v.slice(0, -1), dir: -1 as const };
            }

            return { type: v, dir: 1 as const };
        });

        const sorter: SQL[] = [];

        for (const { type, dir } of parts) {
            const func = dir === 1 ? asc : desc;

            switch (type) {
            case 'name':
                sorter.push(func(CardPrintView.card.name));
                break;
            case 'set':
            case 'number':
                sorter.push(func(CardPrintView.set));
                sorter.push(func(CardPrintView.number));
                break;
            case 'date':
                sorter.push(func(CardPrintView.print.releaseDate));
                break;
            case 'id':
                sorter.push(func(CardPrintView.cardId));
                break;
            case 'cmc':
            case 'mv':
            case 'cost':
                sorter.push(func(CardPrintView.card.cost));
                break;
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }

        return {
            type:   'order-by',
            orders: sorter,
        };
    },
});

type SearchOption = {
    page:     number;
    pageSize: number;
    lang:     Locale;
    groupBy:  string;
    orderBy:  string;
};

type DevSearchOption = {
    pageSize: number;
    groupBy:  string;
};

export default defineServerModel({
    commands: [
        raw,
        stats,
        fullStats,
        hash,
        set,
        num,
        lang,
        cost,
        color,
        lore,
        strength,
        willPower,
        moveCost,
        name,
        type,
        text,
        flavorText,
        layout,
        rarity,
        order,
    ],

    actions: {
        async search(query: SQL, post: PostAction[], options: SearchOption): Promise<NormalResult> {
            const startTime = Date.now();

            const { page, pageSize, lang, groupBy, orderBy } = options;

            const groupByColumn = groupBy === 'card'
                ? [CardPrintView.cardId]
                : [CardPrintView.cardId, CardPrintView.set, CardPrintView.number];

            const groupByCount = groupBy === 'card'
                ? sql`count(distinct card_id)`.as('count')
                : sql`count(distinct (card_id, set, number))`.as('count');

            const orderByAction = post.find(v => v.type === 'order-by') as OrderBy
              ?? order!.post!({ operator: ':', qualifier: [], parameter: orderBy });

            const result = await db
                .selectDistinctOn(groupByColumn)
                .from(CardPrintView)
                .where(query)
                .orderBy(
                    ...groupByColumn,
                    sql`CASE
                        WHEN ${CardPrintView.lang} = ${lang} THEN 0
                        WHEN ${CardPrintView.lang} = 'en' THEN 1
                        ELSE 2
                    END`,
                    ...orderByAction.orders,
                )
                .limit(pageSize)
                .offset((page - 1) * pageSize);

            // Count the total records matching the same SQL query
            const countResult = await db
                .select({ count: groupByCount })
                .from(CardPrintView)
                .where(query);

            const total = Number(countResult[0]?.count || 0);

            const totalPage = Math.ceil(total / pageSize);

            const endTime = Date.now();
            const elapsed = endTime - startTime;

            return {
                result,
                total,
                page,
                totalPage,
                elapsed,
            };
        },

        async dev(query: SQL, post: PostAction[], options: DevSearchOption): Promise<DevResult> {
            const startTime = Date.now();

            const groupBy = options.groupBy;
            let pageSize = options.pageSize;

            if (pageSize > 200) {
                pageSize = 200;
            }

            const groupByColumn = groupBy === 'card'
                ? [CardEditorView.cardId]
                : groupBy === 'lang'
                    ? [CardEditorView.cardId, CardEditorView.set, CardEditorView.number]
                    : [CardEditorView.cardId, CardEditorView.set, CardEditorView.number, CardEditorView.lang];

            const groupByCount = groupBy === 'card'
                ? sql`count(distinct card_id)`.as('count')
                : sql`count(distinct (card_id, set, number, lang))`.as('count');

            const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
              ?? order.post!({ operator: ':', qualifier: [], parameter: 'id+' });

            const result = await db
                .selectDistinctOn(groupByColumn)
                .from(CardEditorView)
                .where(query)
                .orderBy(
                    ...groupByColumn,
                    sql`CASE
                        WHEN ${CardEditorView.lang} = ${lang} THEN 0
                        WHEN ${CardEditorView.lang} = 'en' THEN 1
                        ELSE 2
                    END`,
                    ...orderByAction.orders,
                )
                .limit(pageSize);

            // Count the total records matching the same SQL query
            const countResult = await db
                .select({ count: groupByCount })
                .from(CardEditorView)
                .where(query);

            const total = Number(countResult[0]?.count || 0);

            const endTime = Date.now();
            const elapsed = endTime - startTime;

            return {
                result,
                total,
                elapsed,
            };
        },
    },
});
