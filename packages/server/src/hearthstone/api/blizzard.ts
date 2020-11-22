import KoaRouter from '@koa/router';

import { Context, DefaultState } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import blzApi from '../blizzard/api';

import { MetadataGetter } from '../blizzard/metadata';
import { CardGetter } from '../blizzard/card';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/blizzard');

router.get('/metadata', async ctx => {
    ctx.body = await blzApi('/hearthstone/metadata');
});

const metadataGetter = new MetadataGetter();

router.get('/get-metadata',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        metadataGetter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

const cardGetter = new CardGetter();

router.get('/get-card',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        cardGetter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

export default router;
