import KoaRouter from '@koa/router';

import magic from './magic/router/image';
import hearthstone from './hearthstone/router/image';

const router = new KoaRouter();

router.use(magic.routes());
router.use(hearthstone.routes());

export default router;
