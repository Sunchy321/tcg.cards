import { publicProcedure, router } from './trpc';
import z from 'zod';

import { Game, games } from '@interface/index';
import { generateOpenApiDocument } from 'trpc-to-openapi';

export const appRouter = router({
    '': publicProcedure
        .meta({ openapi: { method: 'GET', path: '/' } })
        .input(z.void())
        .output(z.object({
            games: z.array(z.enum(games)).readonly(),
        }))
        .query(() => {
            return { games };
        }),
});

export type AppRouter = typeof appRouter;

export const openapiDocument = generateOpenApiDocument(appRouter, {
    title:       'Game Server API',
    version:     '1.0.0',
    description: 'API for tcg.cards',
    baseUrl:     '/api',
});
