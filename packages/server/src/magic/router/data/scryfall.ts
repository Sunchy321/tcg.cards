import { eventIterator, os } from '@orpc/server';

import z from 'zod';
import { scryfallBulk } from '@model/magic/schema/data/database';
import { imageTaskStatus, imageType } from '@model/magic/schema/data/scryfall/image';

import { status } from '@model/magic/schema/data/status';

import { BulkGetter } from '@/magic/data/scryfall/bulk';
import { CardLoader } from '@/magic/data/scryfall/card';
import { RulingLoader } from '@/magic/data/scryfall/ruling';
import { SetGetter } from '@/magic/data/scryfall/set';
import { ImageGetter } from '@/magic/data/scryfall/image';

const bulk = os
    .input(z.void())
    .output(scryfallBulk)
    .handler(async () => {
        return BulkGetter.data();
    });

const downloadBulk = os
    .input(z.void())
    .output(eventIterator(status))
    .handler(async function* () {
        const getter = new BulkGetter();

        yield* getter.intoGenerator();
    });

const loadCard = os
    .input(z.object({ file: z.string() }))
    .output(eventIterator(status))
    .handler(async function* ({ input }) {
        const { file } = input;

        const loader = new CardLoader(file);

        yield* loader.intoGenerator();
    });

const loadRuling = os
    .input(z.object({ file: z.string() }))
    .output(eventIterator(status))
    .handler(async function* ({ input }) {
        const { file } = input;

        const loader = new RulingLoader(file);

        yield* loader.intoGenerator();
    });

const getSet = os
    .input(z.void())
    .output(eventIterator(status))
    .handler(async function* () {
        const loader = new SetGetter();

        yield* loader.intoGenerator();
    });

const getImage = os
    .input(imageType)
    .output(eventIterator(imageTaskStatus))
    .handler(async function* ({ input }) {
        const type = input;

        const getter = new ImageGetter(type);

        yield* getter.intoGenerator();
    });

export const scryfallTrpc = {
    bulk,
    downloadBulk,
    loadCard,
    loadRuling,
    getSet,
    getImage,
};
