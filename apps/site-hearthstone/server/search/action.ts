import { as as create } from '#search/server/action';

import type { Locale } from '#model/hearthstone/schema/basic';
import type { NormalResult } from '#model/hearthstone/schema/search';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '#db/db';
import { LatestCardEntityView } from '#schema/shared/hearthstone/entity';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import type { Expression } from '#search/parser';

import { detectAmbit } from '#search/ambit';
import type { Ambit } from '#search/ambit';
import { ambitCeiling, searchWithAmbitCeiling } from '#search/server/ambit';

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

export const search = as
  .table(LatestCardEntityView)
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
        table: LatestCardEntityView as any,
      });
    const hasLangCommand = /\blang[:=]/.test(dsl);
    const { explicit, pinned } = detectAmbit(dsl);

    const executeSearch = async (ceiling: Ambit | null) => {
      const baseQuery = hasLangCommand
        ? query
        : and(query, eq(LatestCardEntityView.lang, lang));
      const visibleQuery = ceiling == null
        ? baseQuery
        : and(baseQuery, ambitCeiling(LatestCardEntityView.ambit, ceiling));

      const resultQuery = db
        .select()
        .from(LatestCardEntityView)
        .where(visibleQuery!)
        .orderBy(...orderByAction)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const result = await resultQuery;

      const countQuery = db
        .select({ count: sql`count(distinct card_id)`.as('count') })
        .from(LatestCardEntityView)
        .where(visibleQuery!);

      const countResult = await countQuery;

      const total = Number(countResult[0]?.count ?? 0);

      return { displayedResult: result, total };
    };

    const { landing, result } = await searchWithAmbitCeiling({
      pinned,
      explicit,
      run: executeSearch,
    });

    const totalPage = Math.ceil(result.total / pageSize);
    const elapsed = Date.now() - startTime;

    return {
      result:  result.displayedResult,
      total:   result.total,
      page,
      totalPage,
      elapsed,
      variant: await detectVariant(dsl),
      ambit:   landing,
    };
  });
