import KoaRouter from '@koa/router';

import { Context, DefaultState } from 'koa';

import blzApi from '@/hearthstone/blizzard/api';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/blizzard');

router.get('/metadata', async ctx => {
    ctx.body = await blzApi('/hearthstone/metadata');
});

export default router;
