import KoaRouter from '@koa/router';

import hsdata from './hsdata';
import blizzard from './blizzard';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(hsdata.routes());
router.use(blizzard.routes());

export default router;
