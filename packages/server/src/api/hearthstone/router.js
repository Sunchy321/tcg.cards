import KoaRouter from '@koa/router';

import { patches } from './hsdata';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.get('/patches', async ctx => {
    ctx.body = await patches();
});

export default router;