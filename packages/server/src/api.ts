import KoaRouter from '@koa/router';

import hearthstone from './hearthstone/api';
import magic from './magic/api';

import basic from '@data/basic';

const router = new KoaRouter();

router.get('/', async ctx => {
    ctx.body = basic;
});

router.use(hearthstone.routes());
router.use(magic.routes());

export default router;
