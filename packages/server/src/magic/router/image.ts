import { os } from '@orpc/server';

import z from 'zod';
import { and, eq } from 'drizzle-orm';

import { ImageGetter } from '@/magic/scryfall/image';
import FileSaver from '@/common/save-file';

import { locale } from '@model/magic/schema/basic';

import { db } from '@/drizzle';
import { Print } from '@/magic/schema/print';

import { cardImagePath } from '@/magic/image';

const _imageGetters: Record<string, ImageGetter> = { };

// router.get(
//     '/get',
//     websocket,
//     async ctx => {
//         const ws = await ctx.ws();

//         const { type } = mapValues(ctx.query, toSingle);

//         if (type == null) {
//             ctx.status = 400;
//             ws.close();
//         } else {
//             if (imageGetters[type] == null) {
//                 imageGetters[type] = new ImageGetter(type);
//             }

//             imageGetters[type].on('end', () => delete imageGetters[type]);
//             imageGetters[type].bind(ws);
//         }

//         ctx.status = 200;
//     },
// );

const reload = os
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
    });

export const imageTrpc = {
    reload,
};
