import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

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

export const searchApi = new Hono()
    .get(
        '/',
        describeRoute({
            description: 'Search for cards',
            tags:        ['Magic', 'Search'],
            responses:   {
                200: {
                    description: 'Successful search',
                    content:     {
                        'application/json': {
                            schema: resolver(searchResult),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', searchInput.extend({
            lang:     fullLocale.default('en'),
            page:     z.string().transform(v => Number.parseInt(v, 10) || 1).pipe(z.int().int().positive()),
            pageSize: z.string().transform(v => Number.parseInt(v, 10) || 100).pipe(z.int().int().positive()),
            groupBy:  z.enum(['card', 'print']).default('card'),
            orderBy:  z.string().default('id+'),
        })),
        async c => c.json(await searchTrpc(c.req.valid('query'))),
    );
