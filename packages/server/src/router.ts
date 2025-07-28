import { t } from '@/trpc';
import z from 'zod';

import { games } from '@interface/index';
import { generateOpenApiDocument } from 'trpc-to-openapi';

import { gameRouter as magicRouter } from '@/magic/router';

export const appRouter = t.router({
    root: t.procedure
        .meta({ openapi: { method: 'GET', path: '/' } })
        .input(z.void())
        .output(z.object({
            games: z.array(z.enum(games)).readonly(),
        }))
        .query(() => {
            return { games };
        }),

    magic: magicRouter,
});

export type AppRouter = typeof appRouter;

export const openapiDocument = generateOpenApiDocument(appRouter, {
    title:       'Game Server API',
    version:     '1.0.0',
    description: 'API for tcg.cards',
    baseUrl:     '/api',
});
