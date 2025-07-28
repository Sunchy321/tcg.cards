import { publicProcedure, router } from '@/trpc';
import { z } from 'zod';
export const gameRouter = router({
    root: publicProcedure
        .meta({ openapi: { method: 'GET', path: '/magic' } })
        .input(z.void())
        .output(z.string())
        .query(() => {
            return 'magic';
        }),
    random: publicProcedure
        .meta({ openapi: { method: 'GET', path: '/magic/random' } })
        .input(z.void())
        .output(z.string())
        .query(async () => {
            return 'magic';
        }),
});
