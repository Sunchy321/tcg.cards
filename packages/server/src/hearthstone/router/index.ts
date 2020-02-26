import * as KoaRouter from 'koa-router';

import action from './action';

const router = new KoaRouter();

router.use(action.routes(), action.allowedMethods());

export default router;
