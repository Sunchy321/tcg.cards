import { SyncTask } from '@/integrated/sync';
import websocket from '@/middlewares/websocket';
import KoaRouter from '@koa/router';

const router = new KoaRouter();

router.prefix('/integrated');

const syncTask = new SyncTask();

router.get(
    '/sync',
    websocket,
    async ctx => {
        syncTask.bind(await ctx.ws());

        ctx.status = 200;
    },
);

export default router;
