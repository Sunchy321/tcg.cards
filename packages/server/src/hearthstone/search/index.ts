import { and, SQL, asc, desc, eq, not, or, sql } from 'drizzle-orm';

import { PgColumn } from 'drizzle-orm/pg-core';
import { QueryError } from '@search/command/error';
import { OrderBy, PostAction, defineServerCommand } from '@/search/command';
import { NormalResult } from '@model/hearthstone/schema/search';
import { Locale } from '@model/hearthstone/schema/basic';

import _ from 'lodash';
import { defineServerModel } from '@/search/model';

import { db } from '@/drizzle';
import { CardEntityView } from '../schema/entity';

import * as builtin from '@/search/command/builtin';

import { commands } from '@model/hearthstone/search';

const raw = defineServerCommand({
    command: commands.raw,
    query:   ({ parameter }) => {
        return or(
            builtin.text.query({
                column:    CardEntityView.localization.name,
                multiline: false,
                parameter,
                operator:  ':',
                qualifier: [],
            }),
            builtin.text.query({
                column:    CardEntityView.localization.text,
                multiline: false,
                parameter,
                operator:  ':',
                qualifier: [],
            }),
        )!;
    },
});

const fullStats = defineServerCommand({
    command: commands.fullStats,

    query({ pattern, operator, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        if (operator === '') {
            operator = '=';
        }

        const { cost, attack, health } = pattern;

        if (!qualifier?.includes('!')) {
            return and(
                builtin.number.query({
                    column:    CardEntityView.cost,
                    parameter: cost,
                    operator:  '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardEntityView.attack,
                    parameter: attack,
                    operator:  '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardEntityView.health,
                    parameter: health,
                    operator:  '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            )!;
        } else {
            return or(
                builtin.number.query({
                    column:    CardEntityView.cost,
                    parameter: cost,
                    operator:  '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardEntityView.attack,
                    parameter: attack,
                    operator:  '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardEntityView.health,
                    parameter: health,
                    operator:  '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            )!;
        }
    },
});

const stats = defineServerCommand({
    command: commands.stats,

    query({ pattern, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        const { attack, health } = pattern;

        if (!qualifier?.includes('!')) {
            return and(
                builtin.number.query({
                    column:    CardEntityView.attack,
                    parameter: attack,
                    operator:  '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardEntityView.health,
                    parameter: health,
                    operator:  '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            )!;
        } else {
            return or(
                builtin.number.query({
                    column:    CardEntityView.attack,
                    parameter: attack,
                    operator:  '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                builtin.number.query({
                    column:    CardEntityView.health,
                    parameter: health,
                    operator:  '=',
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

        const match = /^(.*?)[:=](.*)$/.exec(tag);

        const escape = (text: string) => text.replace(/[%_|*+?{}()[\]]/g, '\\$&');

        const tester = (column: PgColumn) => match == null
            ? sql`${column} similar to ${`${escape(tag)}|${escape(tag)}:%`}`
            : sql`${column} similar to ${`${escape(match[1])}:${escape(match[2])}`}`;

        if (!qualifier.includes('!')) {
            return or(
                tester(CardEntityView.mechanics),
                tester(CardEntityView.referencedTags),
            )!;
        } else {
            return and(
                not(tester(CardEntityView.mechanics)),
                not(tester(CardEntityView.referencedTags)),
            )!;
        }
    },
});

const lang = builtin.simple(commands.lang, { column: CardEntityView.lang });

const name = builtin.text(commands.name, {
    column:    CardEntityView.localization.name,
    multiline: false,
});

const text = builtin.text(commands.text, {
    column:    CardEntityView.localization.text,
    multiline: true,
});

const flavorText = builtin.text(commands.flavorText, {
    column:    CardEntityView.localization.flavorText,
    multiline: true,
});

const set = builtin.simple(commands.set, { column: CardEntityView.set });

const classes = builtin.simpleSet(commands.classes, { column: CardEntityView.classes });
const type = builtin.simple(commands.type, { column: CardEntityView.type });
const cost = builtin.number(commands.cost, { column: CardEntityView.cost });
const attack = builtin.number(commands.attack, { column: CardEntityView.attack });
const health = builtin.number(commands.health, { column: CardEntityView.health });
const durability = builtin.number(commands.durability, { column: CardEntityView.durability });
const armor = builtin.number(commands.armor, { column: CardEntityView.armor });

const rune = builtin.simpleSet(commands.rune, { column: CardEntityView.rune });
const race = builtin.simple(commands.race, { column: CardEntityView.race });
const spellSchool = builtin.simple(commands.spellSchool, { column: CardEntityView.spellSchool });

const techLevel = builtin.number(commands.techLevel, { column: CardEntityView.techLevel });
const raceBucket = builtin.simple(commands.raceBucket, { column: CardEntityView.raceBucket });

const mercenaryRole = builtin.simple(commands.mercenaryRole, { column: CardEntityView.mercenaryRole });
const mercenaryFaction = builtin.simple(commands.mercenaryFaction, { column: CardEntityView.mercenaryFaction });

const rarity = builtin.simple(commands.rarity, { column: CardEntityView.rarity });

const artist = builtin.text(commands.artist, {
    column:    CardEntityView.artist,
    multiline: false,
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
                sorter.push(func(CardEntityView.localization.name));
                break;
            case 'id':
                sorter.push(func(CardEntityView.cardId));
                break;
            case 'cost':
                sorter.push(func(CardEntityView.cost));
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

export default defineServerModel({
    commands: [
        raw,
        fullStats,
        stats,
        hash,
        lang,
        name,
        text,
        flavorText,
        set,
        classes,
        type,
        cost,
        attack,
        health,
        durability,
        armor,
        rune,
        race,
        spellSchool,
        techLevel,
        raceBucket,
        mercenaryRole,
        mercenaryFaction,
        rarity,
        artist,
        order,
    ],

    actions: {
        async search(query: SQL, post: PostAction[], options: SearchOption): Promise<NormalResult> {
            const startTime = Date.now();
            const { page, pageSize, lang, groupBy, orderBy } = options;

            const groupByColumn = groupBy === 'card'
                ? [CardEntityView.cardId]
                : [CardEntityView.cardId];

            const groupByCount = groupBy === 'card'
                ? sql`count(distinct card_id)`.as('count')
                : sql`count(distinct (card_id, set, number, lang))`.as('count');

            const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
              ?? order.post!({ operator: ':', qualifier: [], parameter: orderBy });

            const result = await db
                .selectDistinctOn(groupByColumn)
                .from(CardEntityView)
                .where(and(
                    eq(CardEntityView.isLatest, true),
                    eq(CardEntityView.lang, lang),
                    query,
                ))
                .orderBy(
                    ...groupByColumn,
                    ...orderByAction.orders,
                )
                .limit(pageSize)
                .offset((page - 1) * pageSize);

            // Count the total records matching the same SQL query
            const countResult = await db
                .select({ count: groupByCount })
                .from(CardEntityView)
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
    },
});
