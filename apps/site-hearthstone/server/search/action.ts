import { as as create } from '#search/server/action';

import type { Locale } from '#model/hearthstone/schema/basic';
import type { NormalResult } from '#model/hearthstone/schema/search';

import { sql, desc } from 'drizzle-orm';

import { db } from '#db/db';
import { CardEntityView } from '#schema/hearthstone/entity';

import { order } from './command-list';

const as = create;

type SearchOption = {
  page:     number;
  pageSize: number;
  lang:     Locale;
  orderBy:  string;
};

export const search = as
  .table(CardEntityView)
  .handler(async (query, post, options: SearchOption): Promise<NormalResult> => {
    const startTime = Date.now();

    const {
      page,
      pageSize,
      lang,
      orderBy,
    } = options;

    const orderByAction = post.find(p => p.phase === 'order-by')?.action
      ?? order.call({
        value:     orderBy,
        operator:  ':',
        qualifier: [],
      }, {
        meta:  {},
        table: CardEntityView,
      });

    const subquery = db
      .selectDistinctOn([CardEntityView.cardId])
      .from(CardEntityView)
      .where(query)
      .orderBy(
        CardEntityView.cardId,
        sql`CASE
          WHEN ${CardEntityView.lang} = ${lang} THEN 0
          WHEN ${CardEntityView.lang} = 'en' THEN 1
          ELSE 2
        END`,
        desc(CardEntityView.version),
      );

    const result = await db
      .select()
      .from(subquery.as('card_entity_view'))
      .orderBy(...orderByAction)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const countResult = await db
      .select({ count: sql`count(distinct card_id)`.as('count') })
      .from(CardEntityView)
      .where(query);

    const total = Number(countResult[0]?.count ?? 0);
    const totalPage = Math.ceil(total / pageSize);
    const elapsed = Date.now() - startTime;

    return {
      result,
      total,
      page,
      totalPage,
      elapsed,
    };
  });
