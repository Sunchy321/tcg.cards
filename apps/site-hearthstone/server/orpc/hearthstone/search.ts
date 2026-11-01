import { os } from '../index';

import z from 'zod';

import { locale } from '#model/hearthstone/schema/basic';
import { essentialSearchResult, searchResult } from '#model/hearthstone/schema/search';

import { searchInput } from '#search/schema';

import { search } from '~~/server/search';

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
    const { q, page, pageSize, lang, orderBy, ambit } = input;
    return search.search('essential', q, { page, pageSize, lang, orderBy, dsl: q, ambit, d1: context.searchD1 });
  });

export const searchTrpc = {
  basic,
  essential,
};

export const searchApi = {
  '': basic,
  essential,
};
