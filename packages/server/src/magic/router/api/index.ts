import KoaRouter from '@koa/router';

import banlist from './banlist';
import card from './card';
import set from './set';
import cr from './cr';
import scryfall from './scryfall';
import search from './search';

const router = new KoaRouter();

router.prefix('/magic');

router.use(banlist.routes());
router.use(card.routes());
router.use(cr.routes());
router.use(set.routes());
router.use(scryfall.routes());
router.use(search.routes());

export default router;
