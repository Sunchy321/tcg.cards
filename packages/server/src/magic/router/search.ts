import { os } from '@orpc/server';

import z from 'zod';

import { fullLocale } from '@model/magic/schema/basic';
import { devSearchResult, searchResult } from '@model/magic/schema/search';

import { searchInput } from '@search/schema';

import search from '../search';

const basic = os
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
        const { q, page, pageSize, lang, groupBy, orderBy } = input;

        const result = await search.search('search', q, {
            page,
            pageSize,
            lang,
            groupBy,
            orderBy,
        });

        return result;
    })
    .callable();

const dev = os
    .input(searchInput.extend({
        sample:  z.number().min(1).max(100).default(50),
        groupBy: z.enum(['card', 'lang', 'print']).default('card'),
    }))
    .output(devSearchResult.extend({ method: z.string() }))
    .handler(async ({ input }) => {
        const { q, pageSize, groupBy } = input;

        const result = await search.search('dev', q, {
            pageSize,
            groupBy,
        });

        return {
            method: `search:${q}`,
            ...result,
        };
    });

export const searchTrpc = {
    '': basic,
    dev,
};

export const searchApi = basic;
