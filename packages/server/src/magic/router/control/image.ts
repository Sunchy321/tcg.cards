import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import { ImageGetter } from '../../scryfall/image';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/image');

const imageGetters: Record<string, ImageGetter> = { };

router.get('/get',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        const type = ctx.query.type;

        if (type == null) {
            ctx.status = 401;
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
