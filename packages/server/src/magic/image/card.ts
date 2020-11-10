import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import { ProgressWebSocket } from '@/common/progress';

import { ImageGetter } from '../scryfall/image';
import { IStatus } from '../scryfall/interface';

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

    for (const l of locales) {
        const path = `${asset}/magic/card/png/${set}/${l}/${number}.png`;

        if (existsSync(path)) {
            ctx.response.set('content-type', mime.lookup(path) as string);
            ctx.body = createReadStream(path);
            return;
        }
    }

    ctx.status = 404;
});

const imageGetter = new ProgressWebSocket<IStatus>(ImageGetter);

router.get('/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        imageGetter.bind(await ctx.ws());
        await imageGetter.exec();
    },
);

export default router;
