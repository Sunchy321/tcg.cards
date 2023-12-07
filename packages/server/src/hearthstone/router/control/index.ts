import KoaRouter from '@koa/router';

import hsdata from './hsdata';
import blizzard from './blizzard';
import patch from './patch';
import card from './card';
import set from './set';
import format from './format';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(hsdata.routes());
router.use(blizzard.routes());
router.use(patch.routes());
router.use(card.routes());
router.use(set.routes());
router.use(format.routes());

export default router;
