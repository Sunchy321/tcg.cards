import KoaRouter from '@koa/router';

import card from './card';
import cr from './cr';
import format from './format';
import image from './image';
import set from './set';
import scryfall from './scryfall';

const router = new KoaRouter();

router.prefix('/magic');

router.use(card.routes());
router.use(cr.routes());
router.use(format.routes());
router.use(image.routes());
router.use(set.routes());
router.use(scryfall.routes());

export default router;
