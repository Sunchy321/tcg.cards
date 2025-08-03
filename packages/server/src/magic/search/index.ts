import { SQL, asc, desc, sql } from 'drizzle-orm';

import { QueryError } from '@search/command/error';
import { OrderBy, PostAction, defineServerCommand } from '@/search/command';
import { NormalResult } from '@model/magic/schema/search';
import { FullLocale } from '@model/magic/schema/basic';

import { defineServerModel } from '@/search/model';

import { db } from '@/drizzle';
import { CardPrintView } from '../schema/print';

import * as builtin from '@/search/command/builtin';
import { commands } from '@model/magic/search';

const set = builtin.simple(commands.set, { column: CardPrintView.set });

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
                sorter.push(func(CardPrintView.card.manaValue));
                break;
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }

        return {
            type:   'order',
            orders: sorter,
        };
    },
});

type SearchOption = {
    page:     number;
    pageSize: number;
    lang:     FullLocale;
    groupBy:  string;
    orderBy:  string;
};

export default defineServerModel({
    commands: [
        set,
    ],

    actions: {
        async search(query: SQL, post: PostAction[], options: SearchOption): Promise<NormalResult> {
            const startTime = Date.now();
            const { page, pageSize, lang, groupBy, orderBy } = options;

            const groupByColumn = groupBy === 'card'
                ? [CardPrintView.cardId, CardPrintView.partIndex]
                : [CardPrintView.cardId, CardPrintView.set, CardPrintView.number, CardPrintView.partIndex];

            const groupByCount = groupBy === 'card'
                ? sql`count(distinct card_id)`.as('count')
                : sql`count(distinct (card_id, set, number, lang))`.as('count');

            const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
              ?? order.post!({ operator: ':', qualifier: [], parameter: orderBy });

            const result = await db
                .selectDistinctOn(groupByColumn)
                .from(CardPrintView)
                .where(query)
                .orderBy(CardPrintView.partIndex, ...orderByAction.orders);

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
    },
});
