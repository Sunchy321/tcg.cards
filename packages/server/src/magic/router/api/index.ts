import KoaRouter from '@koa/router';

import card from './card';
import cr from './cr';
import crDiff from './cr-diff';
import format from './format';
import set from './set';
import search from './search';

const router = new KoaRouter();

router.prefix('/magic');

router.use(card.routes());
router.use(cr.routes());
router.use(crDiff.routes());
router.use(format.routes());
router.use(set.routes());
router.use(search.routes());

export default router;
