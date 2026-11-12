import { os } from '../index';

import z from 'zod';

import { locale } from '#model/hearthstone/schema/basic';
import { essentialSearchResult, searchResult } from '#model/hearthstone/schema/search';

import { searchInput } from '#search/schema';
import { SearchTimingRecorder } from '#search/server/timing';

import { search } from '~~/server/search';
import { refreshHearthstoneSearchDataset } from '~~/server/search/accelerated-adapter';
import { measureSearchStep } from '~~/server/search/timing';

const basic = os
  .route({
    method:      'GET',
    description: 'Search for cards',
    tags:        ['Hearthstone', 'Search'],
  })
  .input(searchInput.extend({
    lang:    locale.default('en'),
    orderBy: z.string().default('name+'),
  }))
  .output(searchResult)
  .handler(async ({ input }) => {
    await refreshHearthstoneSearchDataset();
    const {
      q,
      page,
      pageSize,
      lang,
      orderBy,
      ambit,
    } = input;

    return search.search('search', q, {
      page,
      pageSize,
      lang,
      orderBy,
      dsl: q,
      ambit,
    });
  });

/** Returns list fields through acceleration or the equivalent original PG fallback. */
const essential = os
  .route({
    method:      'GET',
    description: 'Search for cards with essential result fields',
    tags:        ['Hearthstone', 'Search'],
  })
  .input(searchInput.extend({
    lang:    locale.default('en'),
    orderBy: z.string().default('name+'),
  }))
  .output(essentialSearchResult)
  .handler(async ({ input, context }) => {
    const serverStartedAt = performance.now();
    const timing = new SearchTimingRecorder();
    await measureSearchStep(
      timing,
      'dataset-status-check',
      () => refreshHearthstoneSearchDataset(),
    );
    const { q, page, pageSize, lang, orderBy, ambit } = input;
    const result = await search.search('essential', q, {
      page,
      pageSize,
      lang,
      orderBy,
      dsl: q,
      ambit,
      d1:  context.searchD1,
      timing,
    });

    return {
      ...result,
      timing: {
        serverTotalMs: performance.now() - serverStartedAt,
        stages:        timing.snapshot(),
      },
    };
  });

export const searchTrpc = {
  basic,
  essential,
};

export const searchApi = {
  '': basic,
  essential,
};
