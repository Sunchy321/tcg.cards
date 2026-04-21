import { os } from '@orpc/server';

import z from 'zod';

import { locale } from '#model/hearthstone/schema/basic';
import { searchResult } from '#model/hearthstone/schema/search';

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
    } = input;

    return search.search('search', q, {
      page,
      pageSize,
      lang,
      orderBy,
    });
  })
  .callable();

export const searchTrpc = {
  basic,
};

export const searchApi = {
  '': basic,
};
