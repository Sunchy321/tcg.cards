import KoaRouter from '@koa/router';

import hearthstone from './hearthstone/router/api';
import magic from './magic/router/api';

import basic from '@static/basic';

const router = new KoaRouter();

router.get('/', async ctx => {
    ctx.body = basic;
});

router.use(hearthstone.routes());
router.use(magic.routes());

export default router;
