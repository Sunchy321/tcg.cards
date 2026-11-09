import { as as create } from '#search/server/action';

import type { Locale } from '#model/hearthstone/schema/basic';
import type { NormalResult, EssentialNormalResult } from '#model/hearthstone/schema/search';

import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '#db/db';
import { LatestCardEntityView } from '#schema/shared/hearthstone/entity';

import { detectVariant, hasLanguageCommand } from './context';

import { detectAmbit } from '#search/ambit';
import type { Ambit } from '#search/ambit';
import { ambitCeiling, searchWithAmbitCeiling } from '#search/server/ambit';

import { order } from './command-list';
import { essentialCardSearchItem } from '#model/hearthstone/schema/search';
import { pickSimpleTags } from '#model/hearthstone/search/manifest';
import { HearthstonePgEssentialSearchAdapter } from './accelerated-adapter';
import { HearthstoneD1EssentialSearchAdapter } from './d1/adapter';
import type { HearthstoneSearchD1Database } from './d1/types';
import { compileQueryRequest } from '#search/server/translate';
import type { QueryRequest } from '#search/logical';
import type { CommonServerCommand } from '#search/server/command';
import * as commands from './command-list';

const as = create;

/** Carries the public search paging, language, sorting, and scope inputs. */
export type SearchOption = {
  page:     number;
  pageSize: number;
  lang:     Locale;
  orderBy:  string;
  dsl:      string;
  d1?:      HearthstoneSearchD1Database;

  // The ambit scope selector's URL param; an ambit command in the DSL
  // overrides it, so it is only the starting ceiling of the widening ladder.
  ambit?: Ambit;
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
      ambit,
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
    const hasLangCommand = hasLanguageCommand(dsl);
    const { explicit, pinned } = detectAmbit(dsl);

    const executeSearch = async (ceiling: Ambit | null) => {
      // Hearthstone search never surfaces enchantments, whatever the ambit
      // ceiling says: they exist as detail-page relation data only, so the
      // exclusion sits on top of every ceiling, including an explicit full.
      // (SQL <> also drops typeless helper entities, as the retired default
      // filter always did.)
      const baseQuery = hasLangCommand
        ? and(query, ne(LatestCardEntityView.type, 'enchantment'))
        : and(query, eq(LatestCardEntityView.lang, lang), ne(LatestCardEntityView.type, 'enchantment'));
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
        .select({ count: sql`count(distinct (card_id, lang))`.as('count') })
        .from(LatestCardEntityView)
        .where(visibleQuery!);

      const countResult = await countQuery;

      const total = Number(countResult[0]?.count ?? 0);

      return { displayedResult: result, total };
    };

    const { landing, result } = await searchWithAmbitCeiling({
      pinned,
      explicit,
      start: ambit,
      run:   executeSearch,
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

/** Preserves the complete basic endpoint while exposing a separate list-only action. */
export const essential = as
  .table(LatestCardEntityView)
  .handler(async (query, post, options: SearchOption) => {
    const result = await search.handler(query, post, options);
    return {
      ...result,
      result: result.result.map(row => essentialCardSearchItem.strip().parse({
        ...row,
        localization: { name: row.localization.name, text: row.localization.text },
        simpleTags:   pickSimpleTags(row.mechanics),
      })),
    };
  }, {
    localAdapter:       new HearthstoneD1EssentialSearchAdapter(runPgEssential),
    acceleratedAdapter: new HearthstonePgEssentialSearchAdapter(runOriginalEssential),
  });

/** Recompiles the original essential path if its projected tables disappear after activation. */
async function runOriginalEssential(request: QueryRequest, options: SearchOption): Promise<EssentialNormalResult> {
  const compiled = compileQueryRequest(request, Object.values(commands) as CommonServerCommand[], LatestCardEntityView);
  return essential.handler(compiled.query ?? sql`TRUE`, compiled.post, options);
}

/** Reuses PG acceleration when available and otherwise preserves the original essential reader. */
async function runPgEssential(request: QueryRequest, options: SearchOption): Promise<EssentialNormalResult> {
  const adapter = new HearthstonePgEssentialSearchAdapter(runOriginalEssential);
  return adapter.plan(request).type === 'exact' ? adapter.execute(request, options) : runOriginalEssential(request, options);
}
