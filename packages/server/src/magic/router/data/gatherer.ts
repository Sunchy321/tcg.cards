import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { os } from '@orpc/server';

import z from 'zod';

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

export const gathererTrpc = {
    parseCard,
    saveImage,
};

export const gathererSSE = new Hono()
    .get(
        '/load-image',
        zValidator('query', z.object({ setId: z.string() })),
        async c => {
            const setId = c.req.valid('query').setId;

            const task = new GathererImageTask(setId);

            return task.bind(c);
        },
    );
