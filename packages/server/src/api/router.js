import KoaRouter from '@koa/router';

import hearthstone from './hearthstone/router';

import data from '@/data';

const router = new KoaRouter();

router.get('/', async (ctx) => {
    ctx.body = {
        games: data.games
    };
});

router.use(hearthstone.routes());

export default router;