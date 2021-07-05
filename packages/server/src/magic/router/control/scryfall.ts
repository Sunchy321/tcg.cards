import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import Card from '@/magic/db/card';
import Set from '@/magic/db/set';

import ScryfallCard from '@/magic/db/scryfall/card';
import ScryfallRuling from '@/magic/db/scryfall/ruling';
import ScryfallSet from '@/magic/db/scryfall/set';

import { BulkGetter, BulkLoader } from '@/magic/scryfall/bulk';
import { SetGetter } from '@/magic/scryfall/set';
import { CardMerger } from '@/magic/scryfall/merge/card';
import { RulingMerger } from '@/magic/scryfall/merge/ruling';
import { SetMerger } from '@/magic/scryfall/merge/set';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

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
    async ctx => {
        bulkGetter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const bulkLoaders: Record<string, BulkLoader> = { };

router.get('/bulk/load',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        const file = mapValues(ctx.query, toSingle).file;

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

        ctx.status = 200;
    },
);

const setGetter = new SetGetter();

router.get('/set/get',
    websocket,
    async ctx => {
        setGetter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const setMerger = new SetMerger();

router.get('/set/merge',
    websocket,
    async ctx => {
        setMerger.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const cardMerger = new CardMerger();

router.get('/card/merge',
    websocket,
    async ctx => {
        cardMerger.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const rulingMerger = new RulingMerger();

router.get('/ruling/merge',
    websocket,
    async ctx => {
        rulingMerger.bind(await ctx.ws());
        ctx.status = 200;
    },
);

export default router;
