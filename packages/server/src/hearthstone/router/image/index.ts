import KoaRouter from '@koa/router';

import entity from './entity';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(entity.routes());

export default router;
