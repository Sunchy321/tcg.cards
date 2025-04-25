import KoaRouter from '@koa/router';

import card from './card';
import print from './print';
import ruling from './ruling';
import cr from './cr';
import format from './format';
import image from './image';
import set from './set';
import scryfall from './scryfall';
import mtgjson from './mtgjson';

const router = new KoaRouter();

router.prefix('/yugioh');

router.use(card.routes());
router.use(print.routes());
router.use(ruling.routes());
router.use(cr.routes());
router.use(format.routes());
router.use(image.routes());
router.use(set.routes());
router.use(scryfall.routes());
router.use(mtgjson.routes());

export default router;
