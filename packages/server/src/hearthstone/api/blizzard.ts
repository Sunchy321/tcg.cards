import KoaRouter from '@koa/router';

import { Context, DefaultState } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import blzApi from '../blizzard/api';

import { MetadataGetter } from '../blizzard/metadata';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/blizzard');

router.get('/metadata', async ctx => {
    ctx.body = await blzApi('/hearthstone/metadata');
});

const getter = new MetadataGetter();

router.get('/get-metadata',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        getter.bind(await ctx.ws());
    },
);

export default router;
