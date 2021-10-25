import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import { ImageGetter } from '@/magic/scryfall/image';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/image');

const imageGetters: Record<string, ImageGetter> = { };

router.get('/get',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        const type = mapValues(ctx.query, toSingle).type;

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

export default router;
