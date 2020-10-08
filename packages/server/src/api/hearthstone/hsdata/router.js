import KoaRouter from '@koa/router';

import { hasData, getData, loadData, loadPatch, getPatches } from './hsdata';

const router = new KoaRouter();

router.prefix('/hsdata');

router.get('/', async ctx => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        ctx.body = {
            hasData: hasData(),
        };
    } else {
        ctx.status = 401;
    }
});

router.post('/get-data', async ctx => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        await getData();
        ctx.status = 200;
    } else {
        ctx.status = 401;
    }
});

router.post('/load-data', async ctx => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        await loadData();
        ctx.status = 200;
    } else {
        ctx.status = 401;
    }
});

router.post('/load-patch', async ctx => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        const result = await loadPatch(ctx.request.body.version);

        ctx.body = result;
    } else {
        ctx.status = 401;
    }
});

export default router;
