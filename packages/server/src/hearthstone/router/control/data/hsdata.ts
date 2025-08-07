import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import websocket from '@/middlewares/websocket';

import { clearPatch } from '@/hearthstone/data/hsdata/patch';
import { PatchLoader } from '@/hearthstone/data/hsdata/task';

import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/hsdata');

router.post('/clear-patch', async ctx => {
    const version = ctx.request.body?.version;

    if (typeof version !== 'number' || Number.isNaN(version)) {
        ctx.status = 400;
        return;
    }

    const result = await clearPatch(version);

    ctx.status = result ? 200 : 400;
});

router.get(
    '/load-patch',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        if (ctx.query.version == null) {
            ctx.status = 400;
            ws.close();
            return;
        }

        const versionText = toSingle(ctx.query.version);

        const version = Number.parseInt(versionText ?? '', 10);

        if (Number.isNaN(version)) {
            ctx.status = 400;
            return;
        }

        const loader = new PatchLoader(version);

        loader.bind(ws);
    },
);

export default router;
