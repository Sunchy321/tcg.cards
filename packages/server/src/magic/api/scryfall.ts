import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import { IBulkStatus } from '../scryfall/bulk/interface';
import { BulkGetter, BulkLoader } from '@/magic/scryfall/bulk';
import { ISetStatus, SetGetter } from '../scryfall/set';
import { SetMerger } from '../scryfall/merge/set';

import Card from '../db/scryfall/card';
import Ruling from '../db/scryfall/ruling';
import Set from '../db/scryfall/set';

import { ProgressWebSocket } from '@/common/progress';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/scryfall');

router.get('/', async ctx => {
    ctx.body = {
        bulk:     BulkGetter.data(),
        database: {
            card:   await Card.count({ }),
            ruling: await Ruling.count({ }),
            set:    await Set.count({ }),
        },
    };
});

const bulkGetter = new ProgressWebSocket<IBulkStatus>(BulkGetter);

router.get('/bulk/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        bulkGetter.bind(await ctx.ws());
        await bulkGetter.exec();
    },
);

const bulkLoader = new ProgressWebSocket<IBulkStatus>(BulkLoader);

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

        bulkLoader.bind(ws, file);
        await bulkLoader.exec();
    },
);

const setGetter = new ProgressWebSocket<ISetStatus>(SetGetter);

router.get('/set/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        setGetter.bind(await ctx.ws());
        await setGetter.exec();
    },
);

const setMerger = new ProgressWebSocket<ISetStatus>(SetMerger);

router.get('/set/merge',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        setMerger.bind(await ctx.ws());
        await setMerger.exec();
    },
);

export default router;
