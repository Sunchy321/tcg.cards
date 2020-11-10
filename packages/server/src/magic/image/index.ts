import KoaRouter from '@koa/router';

import card from './card';

const router = new KoaRouter();

router.prefix('/magic');

router.use(card.routes());

export default router;
