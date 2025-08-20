import { Hono } from 'hono';
import { validator as zValidator } from 'hono-openapi/zod';

import { os } from '@orpc/server';

import z from 'zod';

import { clearPatch, PatchListLoader, RepoPuller } from '@/hearthstone/data/hsdata/patch';
import { PatchLoader } from '@/hearthstone/data/hsdata/task';

const clearPatchAction = os
    .input(z.int().positive())
    .output(z.void())
    .handler(async ({ input }) => {
        const buildNumber = input;

        await clearPatch(buildNumber);
    });

export const hsdataTrpc = {
    clearPatch: clearPatchAction,
};

export const hsdataSSE = new Hono()
    .get(
        '/pull-repo',
        async c => {
            const task = new RepoPuller();

            return task.bind(c);
        },
    )
    .get(
        '/load-patch-list',
        async c => {
            const task = new PatchListLoader();

            return task.bind(c);
        },
    )
    .get(
        '/load-patch',
        zValidator('query', z.object({
            buildNumber: z.preprocess(val => Number.parseInt(val as string, 0), z.int().positive()),
        })),
        async c => {
            const buildNumber = c.req.valid('query').buildNumber;

            const task = new PatchLoader(buildNumber);

            return task.bind(c);
        },
    );
