import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';
import WebSocket from 'ws';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';
import { bulkData, getBulk } from '@/magic/scryfall/bulk';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/scryfall');

router.get('/bulk', async ctx => {
    ctx.body = bulkData();
});

router.all('/bulk/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        const ws: WebSocket = await ctx.ws();

        ws.on('open', async () => {
            await getBulk(p => {
                ws.send(p);
            });

            ws.close();
        });
    },
);

export default router;
