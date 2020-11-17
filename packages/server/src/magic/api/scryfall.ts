import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import Card from '../db/card';
import Set from '../db/set';

import ScryfallCard from '../db/scryfall/card';
import ScryfallRuling from '../db/scryfall/ruling';
import ScryfallSet from '../db/scryfall/set';

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

const bulkGetter = new BulkGetter();

router.get('/bulk/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        bulkGetter.bind(await ctx.ws());
    },
);

const bulkLoaders: Record<string, BulkLoader> = { };

router.get('/bulk/load',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        const ws = await ctx.ws();

        const file = ctx.query.file;

        if (file == null) {
            ctx.status = 401;
            ws.close();
        } else {
            if (bulkLoaders[file] == null) {
                bulkLoaders[file] = new BulkLoader(file);
            }

            bulkLoaders[file].on('end', () => delete bulkLoaders[file]);
            bulkLoaders[file].bind(ws);
        }
    },
);

const setGetter = new SetGetter();

router.get('/set/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        setGetter.bind(await ctx.ws());
    },
);

const setMerger = new SetMerger();

router.get('/set/merge',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        setMerger.bind(await ctx.ws());
    },
);

const cardMerger = new CardMerger();

router.get('/card/merge',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        cardMerger.bind(await ctx.ws());
    },
);

const rulingMerger = new RulingMerger();

router.get('/ruling/merge',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        rulingMerger.bind(await ctx.ws());
    },
);

export default router;