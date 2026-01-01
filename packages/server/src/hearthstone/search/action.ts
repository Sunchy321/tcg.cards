import { as as create } from '@/search/action';

import { Locale } from '@model/hearthstone/schema/basic';
import { NormalResult } from '@model/hearthstone/schema/search';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/drizzle';
import { CardEntityView } from '../schema/entity';

const as = create;

type SearchOption = {
    page:     number;
    pageSize: number;
    lang:     Locale;
    groupBy:  string;
    orderBy:  string;
};

export const search = as
    .table(CardEntityView)
    .handler(async (query, post, options: SearchOption): Promise<NormalResult> => {
        const startTime = Date.now();

        const { page, pageSize, lang, groupBy } = options;

        const groupByColumn = groupBy === 'card'
            ? [CardEntityView.cardId]
            : [CardEntityView.cardId];

        const groupByCount = groupBy === 'card'
            ? sql`count(distinct card_id)`.as('count')
            : sql`count(distinct (card_id, set, number, lang))`.as('count');

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
            )
            .limit(pageSize)
            .offset((page - 1) * pageSize);

        // Count the total records matching the same SQL query
        const countResult = await db
            .select({ count: groupByCount })
            .from(CardEntityView)
            .where(and(
                eq(CardEntityView.isLatest, true),
                eq(CardEntityView.lang, lang),
                query,
            ));

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
    });
