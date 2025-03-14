import KoaRouter from '@koa/router';

import card from './card';
import print from './print';
import set from './set';
import search from './search';

const router = new KoaRouter();

router.prefix('/lorcana');

router.use(card.routes());
router.use(print.routes());
router.use(set.routes());
router.use(search.routes());

export default router;
