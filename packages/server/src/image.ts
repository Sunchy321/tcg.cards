import KoaRouter from '@koa/router';

// import hearthstone from './hearthstone/api';
import magic from './magic/image';

const router = new KoaRouter();

// router.use(hearthstone.routes());
router.use(magic.routes());

export default router;
