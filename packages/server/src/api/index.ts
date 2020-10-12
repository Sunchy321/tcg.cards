import KoaRouter from '@koa/router';

import hearthstone from './hearthstone';

import basic from '@data/basic';

const router = new KoaRouter();

router.get('/', async ctx => {
    ctx.body = {
        games: basic.games,
    };
});

router.use(hearthstone.routes());

export default router;
