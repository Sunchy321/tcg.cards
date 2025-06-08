import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import Print from '@/magic/db/print';

import { ImageGetter } from '@/magic/scryfall/image';
import FileSaver from '@/common/save-file';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import { cardImagePath } from '@/magic/image';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/image');

const imageGetters: Record<string, ImageGetter> = { };

router.get(
    '/get',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        const { type } = mapValues(ctx.query, toSingle);

        if (type == null) {
            ctx.status = 400;
            ws.close();
        } else {
            if (imageGetters[type] == null) {
                imageGetters[type] = new ImageGetter(type);
            }

            imageGetters[type].on('end', () => delete imageGetters[type]);
            imageGetters[type].bind(ws);
        }

        ctx.status = 200;
    },
);

router.post('/reload', async ctx => {
    const { id } = mapValues(ctx.request.body, toSingle);

    const print = await Print.findOne({ _id: id });

    if (print == null) {
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
        for (let i = 0; i < print.parts.length; i += 1) {
            await reloadImage(print.scryfall.imageUris[i].large, cardImagePath(
                'large',
                print.set,
                print.lang,
                print.number,
                i,
            ));
        }
    } else {
        await reloadImage(print.scryfall.imageUris[0].large, cardImagePath(
            'large',
            print.set,
            print.lang,
            print.number,
        ));
    }

    ctx.body = 200;
});

export default router;
