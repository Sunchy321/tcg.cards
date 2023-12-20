import KoaRouter from '@koa/router';

import card from './card';
import entity from './entity';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(card.routes());
router.use(entity.routes());

export default router;
