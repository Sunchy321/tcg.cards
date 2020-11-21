import KoaRouter from '@koa/router';

import { Context, DefaultState } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import { DataGetter, DataLoader, PatchLoader } from '@/hearthstone/hsdata';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/hsdata');

const getter = new DataGetter();

router.get('/get-data',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        getter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const loader = new DataLoader();

router.get('/load-data',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        loader.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const patchLoaders: Record<string, PatchLoader> = { };

router.get('/load-patch',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        const ws = await ctx.ws();

        const version = ctx.query.version;

        if (version == null) {
            ctx.status = 401;
            ws.close();
        } else {
            if (patchLoaders[version] == null) {
                patchLoaders[version] = new PatchLoader(version);
            }

            patchLoaders[version].on('end', () => delete patchLoaders[version]);
            patchLoaders[version].bind(ws);
        }
    },
);

export default router;
