import KoaRouter from '@koa/router';

import scryfall from './scryfall';

const router = new KoaRouter();

router.prefix('/magic');

router.use(scryfall.routes());

export default router;
