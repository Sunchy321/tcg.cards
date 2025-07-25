import { __GAME__ } from '@template/__template__';

import { publicProcedure, router } from '@/trpc';
import { z } from 'zod';

export const gameRouter = router({
    root: publicProcedure
        .meta({ openapi: { method: 'GET', path: `/${__GAME__}` } })
        .input(z.void())
        .output(z.string())
        .query(() => {
            return __GAME__;
        }),

    random: publicProcedure
        .meta({ openapi: { method: 'GET', path: `/${__GAME__}/random` } })
        .input(z.void())
        .output(z.string())
        .query(async () => {
            return __GAME__;
        }),
});
