import KoaRouter from '@koa/router';

import hearthstone from './hearthstone';
import magic from './magic';

import basic from '@data/basic';

const router = new KoaRouter();

router.get('/', async ctx => {
    ctx.body = {
        games: basic.games,
    };
});

router.use(hearthstone.routes());
router.use(magic.routes());

export default router;
