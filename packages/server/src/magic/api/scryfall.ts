import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import { ProgressWebSocket } from '@/common/progress';

import Card from '../db/card';
import Set from '../db/set';

import ScryfallCard from '../db/scryfall/card';
import ScryfallRuling from '../db/scryfall/ruling';
import ScryfallSet from '../db/scryfall/set';

import { IStatus } from '../scryfall/interface';
import { BulkGetter, BulkLoader } from '../scryfall/bulk';
import { SetGetter } from '../scryfall/set';
import { CardMerger } from '../scryfall/merge/card';
import { RulingMerger } from '../scryfall/merge/ruling';
import { SetMerger } from '../scryfall/merge/set';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/scryfall');

router.get('/', async ctx => {
    ctx.body = {
        bulk:     BulkGetter.data(),
        scryfall: {
            card:   await ScryfallCard.estimatedDocumentCount(),
            ruling: await ScryfallRuling.estimatedDocumentCount(),
            set:    await ScryfallSet.estimatedDocumentCount(),
        },
        database: {
            card: await Card.estimatedDocumentCount(),
            set:  await Set.estimatedDocumentCount(),
        },
    };
});

const bulkGetter = new ProgressWebSocket<IStatus>(BulkGetter);

router.get('/bulk/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        bulkGetter.bind(await ctx.ws());
        await bulkGetter.exec();
    },
);

const bulkLoader = new ProgressWebSocket<IStatus>(BulkLoader);

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

const setGetter = new ProgressWebSocket<IStatus>(SetGetter);

router.get('/set/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        setGetter.bind(await ctx.ws());
        await setGetter.exec();
    },
);

const setMerger = new ProgressWebSocket<IStatus>(SetMerger);

router.get('/set/merge',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        setMerger.bind(await ctx.ws());
        await setMerger.exec();
    },
);

const cardMerger = new ProgressWebSocket<IStatus>(CardMerger);

router.get('/card/merge',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        cardMerger.bind(await ctx.ws());
        await cardMerger.exec();
    },
);

const rulingMerger = new ProgressWebSocket<IStatus>(RulingMerger);

router.get('/ruling/merge',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        rulingMerger.bind(await ctx.ws());
        await rulingMerger.exec();
    },
);

export default router;
