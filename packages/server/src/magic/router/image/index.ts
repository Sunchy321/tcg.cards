import KoaRouter from '@koa/router';

import card from './card';
import set from './set';

const router = new KoaRouter();

router.prefix('/magic');

router.use(card.routes());
router.use(set.routes());

export default router;
