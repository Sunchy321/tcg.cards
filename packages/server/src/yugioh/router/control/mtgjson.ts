import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import SetLoader from '@/magic/mtgjson/set';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/mtgjson');

const setLoader = new SetLoader();

router.get(
    '/load-set',
    websocket,
    async ctx => {
        setLoader.bind(await ctx.ws());
        ctx.status = 200;
    },
);

export default router;
