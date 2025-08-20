import { os } from '@orpc/server';

import z from 'zod';

import { fullLocale } from '@model/magic/schema/basic';
import { searchResult } from '@model/magic/schema/search';

import { searchInput } from '@search/schema';

import search from '../search';

export const searchTrpc = os
    .input(searchInput.extend({
        lang:    fullLocale.default('en'),
        groupBy: z.enum(['card', 'print']).default('card'),
        orderBy: z.string().default('id+'),
    }))
    .output(searchResult)
    .handler(async ({ input }) => {
        const { q, page, pageSize, lang, groupBy, orderBy } = input;

        return await search.search('search', q, {
            page,
            pageSize,
            lang,
            groupBy,
            orderBy,
        });
    })
    .callable();

export const searchApi = os
    .route({
        method:      'GET',
        description: 'Search for cards',
        tags:        ['Magic', 'Search'],
    })
    .input(searchInput.extend({
        lang:    fullLocale.default('en'),
        groupBy: z.enum(['card', 'print']).default('card'),
        orderBy: z.string().default('id+'),
    }))
    .output(searchResult)
    .handler(async ({ input }) => {
        return await searchTrpc(input);
    });
