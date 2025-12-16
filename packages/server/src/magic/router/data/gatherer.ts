import { eventIterator, os } from '@orpc/server';

import z from 'zod';
import { imageTaskStatus } from '@model/magic/schema/data/gatherer/image';

import { GathererImageTask, saveGathererImage } from '@/magic/data/gatherer/image';
import { parseGatherer } from '@/magic/data/gatherer/parse';
import { locale } from '@model/magic/schema/basic';

const parseCard = os
    .input(z.int().min(0))
    .output(z.object({
        name:       z.string(),
        typeline:   z.string(),
        text:       z.string(),
        flavorText: z.string().optional(),
    }))
    .handler(async ({ input }) => {
        const multiverseId = input;

        return await parseGatherer(multiverseId);
    });

const saveImage = os
    .input(z.object({
        mids:   z.array(z.number().int().min(0)).min(1).max(2),
        set:    z.string(),
        number: z.string(),
        lang:   locale,
    }))
    .output(z.void())
    .handler(async ({ input }) => {
        const { mids, set, number, lang } = input;

        await saveGathererImage(mids, set, number, lang);
    });

const loadImage = os
    .input(z.string())
    .output(eventIterator(imageTaskStatus))
    .handler(async function* ({ input }) {
        const setId = input;

        const task = new GathererImageTask(setId);

        yield* task.intoGenerator();
    });

export const gathererTrpc = {
    parseCard,
    saveImage,
    loadImage,
};
