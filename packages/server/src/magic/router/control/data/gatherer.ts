import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';
import { GathererImageTask } from '@/magic/data/gatherer/image';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/gatherer');

router.get('/get-image', websocket, async ctx => {
    const ws = await ctx.ws();

    const { set } = mapValues(ctx.query, toSingle);

    if (set == null) {
        ctx.status = 400;
        ws.close();
    } else {
        const task = new GathererImageTask(set);

        task.bind(ws);
    }

    ctx.status = 200;
});

export default router;
