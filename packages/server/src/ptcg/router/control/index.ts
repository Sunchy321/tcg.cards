import KoaRouter from '@koa/router';

import card from './card';
import print from './print';
import image from './image';
import set from './set';
import format from './format';

const router = new KoaRouter();

router.prefix('/ptcg');

router.use(card.routes());
router.use(print.routes());
router.use(image.routes());
router.use(set.routes());
router.use(format.routes());

export default router;
