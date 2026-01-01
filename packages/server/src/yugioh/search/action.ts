import { as as create } from '@/search/action';

import { MainLocale } from '@model/yugioh/schema/basic';
import { DevResult, NormalResult } from '@model/yugioh/schema/search';

import { sql } from 'drizzle-orm';

import { db } from '@/drizzle';
import { CardEditorView, CardPrintView } from '../schema/print';

const as = create;

type SearchOption = {
    page:     number;
    pageSize: number;
    lang:     MainLocale;
    groupBy:  string;
    orderBy:  string;
};

export const search = as
    .table(CardPrintView)
    .handler(async (query, post, options: SearchOption): Promise<NormalResult> => {
        const startTime = Date.now();

        const { page, pageSize, lang, groupBy } = options;

        const groupByColumn = groupBy === 'card'
            ? [CardPrintView.cardId]
            : [CardPrintView.cardId, CardPrintView.set, CardPrintView.number];

        const groupByCount = groupBy === 'card'
            ? sql`count(distinct card_id)`.as('count')
            : sql`count(distinct (card_id, set, number))`.as('count');

        const result = await db
            .selectDistinctOn(groupByColumn)
            .from(CardPrintView)
            .where(query)
            .orderBy(
                ...groupByColumn,
                sql`CASE
                    WHEN ${CardPrintView.lang} = ${lang} THEN 0
                    WHEN ${CardPrintView.lang} = 'ja' THEN 1
                    WHEN ${CardPrintView.lang} = 'en' THEN 2
                    ELSE 3
                END`,
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
    });

type DevSearchOption = {
    pageSize: number;
    lang:     MainLocale;
    groupBy:  string;
};

export const dev = as
    .table(CardEditorView)
    .handler(async (query, post, options: DevSearchOption): Promise<DevResult> => {
        const startTime = Date.now();

        const { groupBy, lang } = options;
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

        const result = await db
            .selectDistinctOn(groupByColumn)
            .from(CardEditorView)
            .where(query)
            .orderBy(
                ...groupByColumn,
                sql`CASE
                    WHEN ${CardEditorView.lang} = ${lang} THEN 0
                    WHEN ${CardEditorView.lang} = 'ja' THEN 1
                    WHEN ${CardEditorView.lang} = 'en' THEN 2
                    ELSE 3
                END`,
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
    });
