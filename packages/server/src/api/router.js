import KoaRouter from '@koa/router';

import data from '#data';

const router = new KoaRouter();

router.get('/', async (ctx) => {
    ctx.body = {
        games: data.games
    };
});

export default router;