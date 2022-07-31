import KoaRouter from '@koa/router';

import hsdata from './hsdata';
import blizzard from './blizzard';
import patch from './patch';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(hsdata.routes());
router.use(blizzard.routes());
router.use(patch.routes());

export default router;
