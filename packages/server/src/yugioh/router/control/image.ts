import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import { ImageGetter } from '@/lorcana/lorcana-json/image';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/image');

const imageGetter = new ImageGetter();

router.get(
    '/get',
    websocket,
    async ctx => {
        imageGetter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

export default router;
