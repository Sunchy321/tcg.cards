import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import z from 'zod';

import { fullLocale } from '@model/magic/schema/basic';
import { searchResult } from '@model/magic/schema/search';

import { searchInput } from '@search/schema';

import search from '../search';

export const searchBase = new Hono()
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
            lang:    fullLocale.default('en'),
            groupBy: z.enum(['card', 'print']).default('card'),
            orderBy: z.string().default('id+'),
        })),
        async c => {
            const { q, page, pageSize, lang, groupBy, orderBy } = c.req.valid('query');

            const output = await search.search('search', q, {
                page,
                pageSize,
                lang,
                groupBy,
                orderBy,
            });

            return c.json(output);
        },
    );

export const searchRouter = new Hono()
    .route('/', searchBase);

export const searchApi = new Hono()
    .route('/', searchBase);
