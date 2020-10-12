import KoaRouter from '@koa/router';

import { hasData, getData, loadData, loadPatch } from '@/hearthstone/hsdata';
import { Context } from 'vm';

const router = new KoaRouter();

router.prefix('/hsdata');

router.get('/', async (ctx: Context) => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        ctx.body = {
            hasData: hasData(),
        };
    } else {
        ctx.status = 401;
    }
});

router.post('/get-data', async (ctx: Context) => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        await getData();
        ctx.status = 200;
    } else {
        ctx.status = 401;
    }
});

router.post('/load-data', async (ctx: Context) => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        await loadData();
        ctx.status = 200;
    } else {
        ctx.status = 401;
    }
});

router.post('/load-patch', async (ctx: Context) => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        await loadPatch(ctx.request.body.version);
        ctx.status = 200;
    } else {
        ctx.status = 401;
    }
});

export default router;
