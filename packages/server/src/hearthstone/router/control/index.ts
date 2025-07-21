import KoaRouter from '@koa/router';

import hsdata from './hsdata';
import blizzard from './blizzard';
import apollo from './apollo';
import patch from './patch';
import set from './set';
import format from './format';
import data from './data';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(hsdata.routes());
router.use(blizzard.routes());
router.use(apollo.routes());
router.use(patch.routes());
router.use(set.routes());
router.use(format.routes());
router.use(data.routes());

export default router;
