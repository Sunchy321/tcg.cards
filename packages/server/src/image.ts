import KoaRouter from '@koa/router';

import magic from './magic/router/image';

const router = new KoaRouter();

router.use(magic.routes());

export default router;
