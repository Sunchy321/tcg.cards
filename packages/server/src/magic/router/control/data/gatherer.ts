import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';
import { GathererImageTask } from '@/magic/data/gatherer/image';
import { parseGatherer } from '@/magic/data/gatherer/parse';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/gatherer');

router.get('/load-image', websocket, async ctx => {
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

router.get('/parse-card', async ctx => {
    const { multiverseId: multiverseIdText } = mapValues(ctx.query, toSingle);

    const multiverseId = parseInt(multiverseIdText, 10);

    if (Number.isNaN(multiverseId)) {
        ctx.status = 400;
        return;
    }

    ctx.body = await parseGatherer(multiverseId);
});

export default router;
