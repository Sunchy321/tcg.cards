import { as as create } from '@/search/action';

import { NormalResult } from '@model/omnisearch/schema/search';

import { sql } from 'drizzle-orm';

import { db } from '@/drizzle';
import { CardView } from '../schema/card';

const as = create;

type SearchOption = {
    page:     number;
    pageSize: number;
    lang:     string;
    orderBy:  string;
};

export const search = as
    .table(CardView)
    .handler(async (query, post, options: SearchOption): Promise<NormalResult> => {
        const startTime = Date.now();

        const { page, pageSize, lang, orderBy } = options;

        const groupByColumn = [CardView.game, CardView.cardId];

        // const orderByAction = post.find(p => p.type === 'order-by') as OrderBy
        //   ?? order.post!({ operator: ':', qualifier: [], parameter: orderBy });

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
                // ...orderByAction.orders,
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
    });
