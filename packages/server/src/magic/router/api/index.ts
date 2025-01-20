import KoaRouter from '@koa/router';

import card from './card';
import cr from './cr';
import format from './format';
import print from './print';
import set from './set';
import search from './search';

const router = new KoaRouter();

router.prefix('/magic');

router.use(card.routes());
router.use(cr.routes());
router.use(format.routes());
router.use(print.routes());
router.use(set.routes());
router.use(search.routes());

export default router;
