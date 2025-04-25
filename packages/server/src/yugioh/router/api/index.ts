import KoaRouter from '@koa/router';

import card from './card';
import cr from './cr';
import format from './format';
import print from './print';
import set from './set';
import search from './search';

import { DatabaseGetter } from '@/yugioh/database/getter';

const router = new KoaRouter();

router.prefix('/yugioh');

router.get('/test', async ctx => {
    const getter = new DatabaseGetter();

    await getter.start();

    ctx.status = 200;
});

router.use(card.routes());
router.use(cr.routes());
router.use(format.routes());
router.use(print.routes());
router.use(set.routes());
router.use(search.routes());

export default router;
