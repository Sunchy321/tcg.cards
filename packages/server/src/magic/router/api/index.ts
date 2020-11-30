import KoaRouter from '@koa/router';

import card from './card';
import search from './search';

import scryfall from './scryfall';
import banlist from './banlist';

const router = new KoaRouter();

router.prefix('/magic');

router.use(card.routes());
router.use(search.routes());

router.use(scryfall.routes());
router.use(banlist.routes());

export default router;
