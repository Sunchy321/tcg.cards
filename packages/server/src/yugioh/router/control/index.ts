import KoaRouter from '@koa/router';

import card from './card';
import print from './print';
import image from './image';
import set from './set';
import lorcanaJson from './data';

const router = new KoaRouter();

router.prefix('/yugioh');

router.use(card.routes());
router.use(print.routes());
router.use(image.routes());
router.use(set.routes());
router.use(lorcanaJson.routes());

export default router;
