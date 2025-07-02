import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import websocket from '@/middlewares/websocket';

import { clearPatch, DataGetter, DataLoader, PatchLoader } from '@/hearthstone/hsdata';
import { ImageGetter } from '@/hearthstone/hsdata/image';

import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/hsdata');

const getter = new DataGetter();

router.get(
    '/get-data',
    websocket,
    async ctx => {
        getter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const loader = new DataLoader();

router.get(
    '/load-data',
    websocket,
    async ctx => {
        loader.bind(await ctx.ws());
        ctx.status = 200;
    },
);

router.post('/clear-patch', async ctx => {
    const version = ctx.request.body?.version;

    if (typeof version !== 'number' || Number.isNaN(version)) {
        ctx.status = 400;
        return;
    }

    const result = await clearPatch(version);

    ctx.status = result ? 200 : 400;
});

const patchLoaders: Record<string, PatchLoader> = { };

router.get(
    '/load-patch',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        if (ctx.query.version == null) {
            ctx.status = 400;
            ws.close();
        } else {
            const versionText = toSingle(ctx.query.version);

            const version = Number.parseInt(versionText ?? '', 10);

            if (Number.isNaN(version)) {
                ctx.status = 400;
                return;
            }

            if (patchLoaders[version] == null) {
                patchLoaders[version] = new PatchLoader(version);
            }

            patchLoaders[version].on('end', () => delete patchLoaders[version]);
            patchLoaders[version].bind(ws);
        }
    },
);

const imageGetter = new ImageGetter();

router.get(
    '/get-image',
    websocket,
    async ctx => {
        imageGetter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

export default router;
