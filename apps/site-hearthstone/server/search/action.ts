import { as as create } from '#search/server/action';

import type { Locale } from '#model/hearthstone/schema/basic';
import type { NormalResult } from '#model/hearthstone/schema/search';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '#db/db';
import { CardEntityView } from '#schema/shared/hearthstone/entity';

import { order } from './command-list';

const as = create;

type SearchOption = {
  page:     number;
  pageSize: number;
  lang:     Locale;
  orderBy:  string;
};

const defaultVisibleCardQuery = and(
  eq(CardEntityView.collectible, true),
  eq(CardEntityView.isLatest, true),
  eq(CardEntityView.inBobsTavern, false),
  sql`${CardEntityView.type} in ('minion', 'spell', 'weapon', 'location', 'hero')`,
  sql`(
    ${CardEntityView.type} in ('minion', 'spell', 'weapon', 'location')
    or (
      ${CardEntityView.type} = 'hero'
      and (
        nullif(btrim(${CardEntityView.localization.displayText}), '') is not null
        or ${CardEntityView.armor} is not null
      )
    )
  )`,
);

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
    const visibleQuery = and(query, defaultVisibleCardQuery);

    const subquery = db
      .selectDistinctOn([CardEntityView.cardId])
      .from(CardEntityView)
      .where(visibleQuery)
      .orderBy(
        CardEntityView.cardId,
        sql`CASE
          WHEN ${CardEntityView.lang} = ${lang} THEN 0
          WHEN ${CardEntityView.lang} = 'en' THEN 1
          ELSE 2
        END`,
        desc(CardEntityView.version),
      );

    console.log('[search] SQL:', JSON.stringify(subquery.toSQL()));
    const result = await db
      .select()
      .from(subquery.as('card_entity_view'))
      .orderBy(...orderByAction)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const cardIds = result.map(card => card.cardId);
    const localizedRows = cardIds.length > 0
      ? await db
        .selectDistinctOn([CardEntityView.cardId])
        .from(CardEntityView)
        .where(and(
          inArray(CardEntityView.cardId, cardIds),
          eq(CardEntityView.lang, lang),
        ))
        .orderBy(CardEntityView.cardId, desc(CardEntityView.version))
      : [];
    const localizedById = new Map(localizedRows.map(card => [card.cardId, card]));
    const displayedResult = result.map(card => localizedById.get(card.cardId) ?? card);

    const countResult = await db
      .select({ count: sql`count(distinct card_id)`.as('count') })
      .from(CardEntityView)
      .where(visibleQuery);

    const total = Number(countResult[0]?.count ?? 0);
    const totalPage = Math.ceil(total / pageSize);
    const elapsed = Date.now() - startTime;

    return {
      result: displayedResult,
      total,
      page,
      totalPage,
      elapsed,
    };
  });
