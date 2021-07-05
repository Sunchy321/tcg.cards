import KoaRouter from '@koa/router';

import { Context, DefaultState } from 'koa';

import websocket from '@/middlewares/websocket';

import { DataGetter, DataLoader, PatchLoader } from '@/hearthstone/hsdata';

import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/hsdata');

const getter = new DataGetter();

router.get('/get-data',
    websocket,
    async ctx => {
        getter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const loader = new DataLoader();

router.get('/load-data',
    websocket,
    async ctx => {
        loader.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const patchLoaders: Record<string, PatchLoader> = { };

router.get('/load-patch',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        if (ctx.query.version == null) {
            ctx.status = 400;
            ws.close();
        } else {
            const version = toSingle(ctx.query.version);

            if (patchLoaders[version] == null) {
                patchLoaders[version] = new PatchLoader(version);
            }

            patchLoaders[version].on('end', () => delete patchLoaders[version]);
            patchLoaders[version].bind(ws);
        }
    },
);

export default router;
