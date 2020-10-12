import KoaRouter from '@koa/router';
import { DefaultState } from 'koa';
import { WebSocketContext } from 'koa-easy-ws';

import { getBulk } from '@/magic/scryfall/bulk';

const router = new KoaRouter<DefaultState, WebSocketContext>();

router.prefix('/scryfall');

router.get('/get-bulk', async ctx => {
    if (ctx.ws) {
        const ws = await ctx.ws();

        ws.on('open', () => {
            getBulk(() => {
                ws.send({
                    progress: 1,
                });
            });
        });
    }
});

export default router;
