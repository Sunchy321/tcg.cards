import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import { ImageGetter } from '../scryfall/image';

import { locales } from '@data/magic/basic';
import { asset } from '@config';
import { createReadStream, existsSync } from 'fs';
import mime from 'mime-types';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/', async ctx => {
    const { lang = 'en', set, number } = ctx.query;

    if (set == null || number == null) {
        ctx.status = 404;
        return;
    }

    const path = `${asset}/magic/card/png/${set}/${lang}/${number}.png`;

    if (existsSync(path)) {
        ctx.response.set('content-type', mime.lookup(path) as string);
        ctx.body = createReadStream(path);
        return;
    }

    if (ctx.query['auto-locale'] != null) {
        for (const l of locales) {
            const path = `${asset}/magic/card/png/${set}/${l}/${number}.png`;

            if (existsSync(path)) {
                ctx.response.set('content-type', mime.lookup(path) as string);
                ctx.body = createReadStream(path);
                return;
            }
        }
    }

    ctx.status = 404;
});

const imageGetter = new ImageGetter();

router.get('/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        imageGetter.bind(await ctx.ws());
    },
);

export default router;
