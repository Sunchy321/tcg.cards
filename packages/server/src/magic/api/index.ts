import KoaRouter from '@koa/router';

import card from './card';
import query from './query';

import scryfall from './scryfall';
import banlist from './banlist';

const router = new KoaRouter();

router.prefix('/magic');

router.use(card.routes());
router.use(query.routes());

router.use(scryfall.routes());
router.use(banlist.routes());

export default router;
