import { eventIterator, os } from '@orpc/server';

import z from 'zod';
import { clearPatchResult, loaderProgress, patchProgress, pullRepoProgress } from '@model/hearthstone/schema/data/hsdata';

import { clearPatch, PatchListLoader, RepoPuller } from '@/hearthstone/data/hsdata/patch';
import { PatchLoader } from '@/hearthstone/data/hsdata/task';

const pullRepo = os
    .input(z.void())
    .output(eventIterator(pullRepoProgress))
    .handler(async function* () {
        const task = new RepoPuller();

        for await (const progress of task.intoGenerator()) {
            yield progress;
        }
    });

const loadPatchList = os
    .input(z.void())
    .output(eventIterator(loaderProgress))
    .handler(async function* () {
        const task = new PatchListLoader();

        for await (const progress of task.intoGenerator()) {
            yield progress;
        }
    });

const loadPatch = os
    .input(z.number().int().positive())
    .output(eventIterator(patchProgress))
    .handler(async function* ({ input }) {
        const buildNumber = input;

        const task = new PatchLoader(buildNumber);

        for await (const progress of task.intoGenerator()) {
            yield progress;
        }
    });

const clearPatchAction = os
    .input(z.int().positive())
    .output(clearPatchResult)
    .handler(async ({ input }) => {
        const buildNumber = input;

        const result = await clearPatch(buildNumber);

        return result;
    });

export const hsdataTrpc = {
    pullRepo,
    loadPatchList,
    loadPatch,
    clearPatch: clearPatchAction,
};
