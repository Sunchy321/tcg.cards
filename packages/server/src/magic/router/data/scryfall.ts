import { eventIterator, os } from '@orpc/server';

import z from 'zod';
import { locale } from '@model/magic/schema/basic';
import { scryfallBulk } from '@model/magic/schema/data/database';
import { imageTaskStatus, imageType } from '@model/magic/schema/data/scryfall/image';
import { status } from '@model/magic/schema/data/status';

import { db } from '@/drizzle';
import { Print } from '@/magic/schema/print';

import FileSaver from '@/common/save-file';

import { BulkGetter } from '@/magic/data/scryfall/bulk';
import { CardLoader } from '@/magic/data/scryfall/card';
import { RulingLoader } from '@/magic/data/scryfall/ruling';
import { SetGetter } from '@/magic/data/scryfall/set';
import { ImageGetter } from '@/magic/data/scryfall/image';

import { and, eq } from 'drizzle-orm';

import { cardImagePath } from '@/magic/image';

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

const reloadImage = os
    .input(z.object({
        cardId: z.string(),
        set:    z.string(),
        number: z.string(),
        lang:   locale,
    }))
    .output(z.void())
    .handler(async ({ input }) => {
        const { cardId, set, number, lang } = input;

        const print = await db.select()
            .from(Print)
            .where(and(
                eq(Print.cardId, cardId),
                eq(Print.set, set),
                eq(Print.number, number),
                eq(Print.lang, lang),
            ))
            .then(rows => rows[0]);

        if (print == null) {
            return;
        }

        if (print.scryfallImageUris == null || print.scryfallImageUris.length === 0) {
            return;
        }

        const reloadImage = async (url: string, path: string) => {
            return new FileSaver(url, path, {
                override: true,
            }).start();
        };

        if ([
            'transform',
            'modal_dfc',
            'transform_token',
            'reversible_card',
            'double_faced',
            'battle',
        ].includes(print.layout)) {
            for (let i = 0; i < print.scryfallImageUris?.length; i += 1) {
                await reloadImage(print.scryfallImageUris[i].large, cardImagePath(
                    'large',
                    print.set,
                    print.lang,
                    print.number,
                    i,
                ));
            }
        } else {
            await reloadImage(print.scryfallImageUris[0].large, cardImagePath(
                'large',
                print.set,
                print.lang,
                print.number,
            ));
        }

        await db
            .update(Print)
            .set({
                fullImageType: 'jpg',
            })
            .where(and(
                eq(Print.set, set),
                eq(Print.number, number),
                eq(Print.lang, lang),
            ));
    });

export const scryfallTrpc = {
    bulk,
    downloadBulk,
    loadCard,
    loadRuling,
    getSet,
    getImage,
    reloadImage,
};
