import KoaRouter from '@koa/router';

import hearthstone from './hearthstone/router/api';
import magic from './magic/router/api';

import data, { games } from '@static/index';

const router = new KoaRouter();

router.get('/', async ctx => {
    ctx.body = {
        games,
        ...data,
    };
});

router.use(hearthstone.routes());
router.use(magic.routes());

export default router;
