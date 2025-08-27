import { SQL, asc, desc, sql } from 'drizzle-orm';

import { QueryError } from '@search/command/error';
import { OrderBy, PostAction, defineServerCommand } from '@/search/command';
import { NormalResult } from '@model/omnisearch/schema/search';
import { FullLocale } from '@model/magic/schema/basic';

import { defineServerModel } from '@/search/model';

import { db } from '@/drizzle';
import { CardView } from '../schema/card';

import * as builtin from '@/search/command/builtin';

import { commands } from '@model/omnisearch/search';

const raw = defineServerCommand({
    command: commands.raw,
    query:   ({ parameter }) => {
        return builtin.text.query({
            column:    CardView.name,
            multiline: false,
            parameter,
            operator:  ':',
            qualifier: [],
        });
    },
});

const name = defineServerCommand({
    command: commands.name,
    query({
        parameter, operator, qualifier,
    }) {
        return builtin.text.query({
            column:    CardView.name,
            multiline: false,
            parameter,
            operator,
            qualifier,
        });
    },
});

const type = defineServerCommand({
    command: commands.type,
    query({
        parameter, operator, qualifier,
    }) {
        return builtin.text.query({
            column:    CardView.typeline,
            multiline: false,
            parameter,
            operator,
            qualifier,
        });
    },
});

const text = defineServerCommand({
    command: commands.text,
    query({
        parameter, operator, qualifier,
    }) {
        return builtin.text.query({
            column:    CardView.text,
            multiline: true,
            parameter,
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
                sorter.push(func(CardView.name));
                break;
            case 'id':
                sorter.push(func(CardView.cardId));
                break;
            case 'game':
                sorter.push(func(CardView.game));
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
    lang:     FullLocale;
    orderBy:  string;
};

export default defineServerModel({
    commands: [
        raw,
        name,
        type,
        text,
        order,
    ],

    actions: {
        async search(query: SQL, post: PostAction[], options: SearchOption): Promise<NormalResult> {
            const startTime = Date.now();
            const { page, pageSize, lang, orderBy } = options;

            const groupByColumn = [CardView.game, CardView.cardId];

            const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
              ?? order.post!({ operator: ':', qualifier: [], parameter: orderBy });

            const result = await db
                .selectDistinctOn([CardView.game, CardView.cardId])
                .from(CardView)
                .where(query)
                .orderBy(
                    ...groupByColumn,
                    sql`CASE
                        WHEN ${CardView.lang} = ${lang} THEN 0
                        ELSE 1
                    END`,
                    ...orderByAction.orders,
                )
                .limit(pageSize)
                .offset((page - 1) * pageSize);

            // Count the total records matching the same SQL query
            const countResult = await db
                .select({ count: sql`count(distinct (game, card_id))`.as('count') })
                .from(CardView)
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
