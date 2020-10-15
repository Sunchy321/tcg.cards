import KoaRouter from '@koa/router';

import { Context, DefaultState } from 'koa';
import { hasData, getData, loadData, loadPatch } from '@/hearthstone/hsdata';

import jwtAuth from '@/middlewares/jwt-auth';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/hsdata');

router.get('/', jwtAuth({ admin: true }), async ctx => {
    ctx.body = {
        hasData: hasData(),
    };
});

router.post('/get-data', jwtAuth({ admin: true }), async ctx => {
    await getData();
    ctx.status = 200;
});

router.post('/load-data', jwtAuth({ admin: true }), async ctx => {
    await loadData();
    ctx.status = 200;
});

router.post('/load-patch', jwtAuth({ admin: true }), async ctx => {
    await loadPatch(ctx.request.body.version);
    ctx.status = 200;
});

export default router;
