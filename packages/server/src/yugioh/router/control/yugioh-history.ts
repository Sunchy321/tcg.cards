import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import Card from '@/yugioh/db/card';
// import Print from '@/yugioh/db/print';
// import Set from '@/yugioh/db/set';

import CardLoader from '@/yugioh/yugioh-history/card';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/yugioh-history');

router.get('/', async ctx => {
    ctx.body = {
        database: {
            card:  await Card.estimatedDocumentCount(),
            print: 0, // await Print.estimatedDocumentCount(),
            set:   0, // await Set.estimatedDocumentCount(),
        },
    };
});

const cardLoader = new CardLoader();

router.get(
    '/load-card',
    websocket,
    async ctx => {
        cardLoader.bind(await ctx.ws());

        ctx.status = 200;
    },
);

export default router;
