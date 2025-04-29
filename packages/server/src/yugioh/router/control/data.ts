import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import Card from '@/yugioh/db/card';
// import Print from '@/yugioh/db/print';
// import Set from '@/yugioh/db/set';

import YGOProdeckLoader from '@/yugioh/ygoprodeck/card';
import YugiohHistoryCardLoader from '@/yugioh/yugioh-history/card';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/data');

router.get('/', async ctx => {
    ctx.body = {
        database: {
            card:  await Card.estimatedDocumentCount(),
            print: 0, // await Print.estimatedDocumentCount(),
            set:   0, // await Set.estimatedDocumentCount(),
        },
    };
});

const ygoprodeckLoader = new YGOProdeckLoader();

router.get(
    '/ygoprodeck',
    websocket,
    async ctx => {
        ygoprodeckLoader.bind(await ctx.ws());

        ctx.status = 200;
    },
);

const yugiohHistoryCardLoader = new YugiohHistoryCardLoader();

router.get(
    '/yugioh-history-card',
    websocket,
    async ctx => {
        yugiohHistoryCardLoader.bind(await ctx.ws());

        ctx.status = 200;
    },
);

export default router;
