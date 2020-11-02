import KoaRouter from '@koa/router';

import scryfall from './scryfall';
import banlist from './banlist';

const router = new KoaRouter();

router.prefix('/magic');

router.use(scryfall.routes());
router.use(banlist.routes());

export default router;
