import { as as create } from '#search/server/action';

import type { Locale } from '#model/hearthstone/schema/basic';
import type { NormalResult } from '#model/hearthstone/schema/search';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '#db/db';
import { CardEntityView, LatestCardEntityView } from '#schema/shared/hearthstone/entity';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import type { Expression } from '#search/parser';

import { order } from './command-list';

const as = create;

let hashTagToVariantPromise: Promise<Record<string, string>> | null = null;

async function getHashTagToVariant(): Promise<Record<string, string>> {
  if (hashTagToVariantPromise != null) return hashTagToVariantPromise;

  hashTagToVariantPromise = (async () => {
    const { Tag } = await import('#schema/shared/hearthstone/tag');
    const rows = await db
      .select({ slug: Tag.slug, enumId: Tag.enumId })
      .from(Tag)
      .where(inArray(Tag.slug, ['has-diamond', 'has-signature']));

    const map: Record<string, string> = {};
    for (const row of rows) {
      const variant = row.slug === 'has-diamond' ? 'diamond' : 'signature';
      map[row.slug] = variant;
      map[String(row.enumId)] = variant;
    }
    return map;
  })();

  return hashTagToVariantPromise;
}

type VariantValue = 'normal' | 'golden' | 'diamond' | 'signature' | 'battlegrounds';

const variantValues: readonly VariantValue[] = ['normal', 'golden', 'diamond', 'signature', 'battlegrounds'];

async function detectVariant(dsl: string): Promise<VariantValue> {
  try {
    const expr = new Parser(dsl).parse();
    const simplified = simplify(expr);

    const tagToVariant = await getHashTagToVariant();
    const variants = new Set<string>();

    const walk = (node: Expression): void => {
      if (node.type === 'not') return;

      if (node.type === 'simple') {
        if (node.qual?.includes('!')) return;

        if (node.cmd === 'hash') {
          const v = tagToVariant[node.args];
          if (v != null) variants.add(v);
        }

        if (node.cmd === 'set') {
          const val = node.args.toLowerCase();
          if (val === 'bgs' || val === 'battlegrounds') variants.add('battlegrounds');
        }
      }

      if (node.type === 'hash') {
        const v = tagToVariant[node.args];
        if (v != null) variants.add(v);
      }

      if (node.type === 'paren') {
        walk(node.expr);
      }

      if (node.type === 'logic') {
        for (const child of node.exprs) walk(child);
      }
    };

    walk(simplified);

    const detected = variants.size === 1 ? [...variants][0] : undefined;
    return variantValues.find(v => v === detected) ?? 'normal';
  } catch {
    return 'normal';
  }
}

type SearchOption = {
  page:     number;
  pageSize: number;
  lang:     Locale;
  orderBy:  string;
  dsl:      string;
};

const defaultVisibleCardQuery = and(
  eq(CardEntityView.collectible, true),
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
      dsl,
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
    const hasLangCommand = /\blang[:=]/.test(dsl ?? '');
    const visibleQuery = hasLangCommand
      ? and(query, defaultVisibleCardQuery)
      : and(query, eq(CardEntityView.lang, lang), defaultVisibleCardQuery);

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

    const result = await db
      .select()
      .from(subquery.as('card_entity_view'))
      .orderBy(...orderByAction)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const cardIds = result.map(card => card.cardId);
    const localizedRows = cardIds.length > 0
      ? await db
        .selectDistinctOn([LatestCardEntityView.cardId])
        .from(LatestCardEntityView)
        .where(and(
          inArray(LatestCardEntityView.cardId, cardIds),
          eq(LatestCardEntityView.lang, lang),
        ))
        .orderBy(LatestCardEntityView.cardId)
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
      result:  displayedResult,
      total,
      page,
      totalPage,
      elapsed,
      variant: await detectVariant(dsl),
    };
  });
