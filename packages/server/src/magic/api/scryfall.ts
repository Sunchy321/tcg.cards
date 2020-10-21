import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';
import { BulkGetter, BulkLoader } from '@/magic/scryfall/bulk';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/scryfall');

router.get('/bulk', async ctx => {
    ctx.body = BulkGetter.data();
});

let getter: BulkGetter | null;

router.get('/bulk/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        const ws = await ctx.ws();

        if (getter == null) {
            getter = new BulkGetter();
        }

        getter.on('progress', progress => {
            ws.send(JSON.stringify(progress));
        });

        await getter.get();

        getter = null;
        ctx.status = 200;
        ws.close();
    },
);

let loader: BulkLoader | null;

router.get('/bulk/load',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        const ws = await ctx.ws();

        const file = ctx.query.file;

        if (file == null) {
            ctx.status = 401;
            ws.close();
            return;
        }

        if (loader == null) {
            loader = new BulkLoader(file);
        } else if (loader.file !== file) {
            loader.abort();
            loader = new BulkLoader(file);
        }

        loader.on('progress', progress => {
            ws.send(JSON.stringify(progress));
        });

        await loader.get();

        loader = null;
        ctx.status = 200;
        ws.close();
    });

export default router;
