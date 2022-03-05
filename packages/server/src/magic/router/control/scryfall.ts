import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import Card from '@/magic/db/card';
import Set from '@/magic/db/set';

import BulkGetter from '@/magic/scryfall/data/bulk';
import CardLoader from '@/magic/scryfall/data/card';
import RulingLoader from '@/magic/scryfall/data/ruling';
import SetGetter from '@/magic/scryfall/data/set';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/scryfall');

router.get('/', async ctx => {
    ctx.body = {
        bulk:     BulkGetter.data(),
        database: {
            card: await Card.estimatedDocumentCount(),
            set:  await Set.estimatedDocumentCount(),
        },
    };
});

const bulkGetter = new BulkGetter();

router.get(
    '/get-bulk',
    websocket,
    async ctx => {
        bulkGetter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const cardLoader = new CardLoader();

router.get(
    '/load-card',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        const { file } = mapValues(ctx.query, toSingle);

        if (file == null) {
            ctx.status = 401;
            ws.close();
        } else {
            cardLoader.init(file);
            cardLoader.bind(ws);
        }

        ctx.status = 200;
    },
);

const rulingLoader = new RulingLoader();

router.get(
    '/load-ruling',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        const { file } = mapValues(ctx.query, toSingle);

        if (file == null) {
            ctx.status = 401;
            ws.close();
        } else {
            rulingLoader.init(file);
            rulingLoader.bind(ws);
        }

        ctx.status = 200;
    },
);

const setGetter = new SetGetter();

router.get(
    '/get-set',
    websocket,
    async ctx => {
        setGetter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

export default router;
