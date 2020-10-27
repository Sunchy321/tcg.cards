import KoaRouter from '@koa/router';

import scryfall from './scryfall';
import banlistChange from './banlist-change';

const router = new KoaRouter();

router.prefix('/magic');

router.use(scryfall.routes());
router.use(banlistChange.routes());

export default router;
