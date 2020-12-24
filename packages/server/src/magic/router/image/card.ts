import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import { ImageGetter } from '../../scryfall/image';

import { createReadStream, existsSync, readdirSync } from 'fs';
import mime from 'mime-types';
import { cardImagePath } from '@/magic/image';

import { asset } from '@config';
import { locales } from '@data/magic/basic';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/', async ctx => {
    const { lang = 'en', set, number, part } = ctx.query;

    if (set == null || number == null) {
        ctx.status = 404;
        return;
    }

    const pngPath = cardImagePath('png', set, lang, number, part);
    const jpgPath = cardImagePath('large', set, lang, number, part);

    if (existsSync(pngPath)) {
        ctx.response.set('content-type', mime.lookup(pngPath) as string);
        ctx.body = createReadStream(pngPath);
        return;
    } else if (existsSync(jpgPath)) {
        ctx.response.set('content-type', mime.lookup(jpgPath) as string);
        ctx.body = createReadStream(jpgPath);
        return;
    }

    if (ctx.query['auto-locale'] != null) {
        for (const l of locales) {
            const pngPath = cardImagePath('png', set, l, number, part);
            const jpgPath = cardImagePath('large', set, l, number, part);

            if (existsSync(pngPath)) {
                ctx.response.set('content-type', mime.lookup(pngPath) as string);
                ctx.body = createReadStream(pngPath);
                return;
            } else if (existsSync(jpgPath)) {
                ctx.response.set('content-type', mime.lookup(jpgPath) as string);
                ctx.body = createReadStream(jpgPath);
                return;
            }
        }
    }

    ctx.status = 404;
});

router.get('/all', async ctx => {
    const { set, lang, type } = ctx.query;

    const path = `${asset}/magic/card/${type}/${set}/${lang}`;

    if (existsSync(path)) {
        ctx.body = readdirSync(path)
            .filter(v => v.endsWith('.png') || v.endsWith('.jpg'))
            .map(v => v.replace(/\..*$/, ''))
            .sort((a, b) => {
                const aLong = a.padStart(10, '0');
                const bLong = b.padStart(10, '0');

                return aLong < bLong ? -1 : 1;
            });
    } else {
        ctx.status = 404;
    }
});

const imageGetters: Record<string, ImageGetter> = { };

router.get('/get',
    websocket,
    jwtAuth({ admin: true }),
    async ctx => {
        const ws = await ctx.ws();

        const type = ctx.query.type;

        if (type == null) {
            ctx.status = 401;
            ws.close();
        } else {
            if (imageGetters[type] == null) {
                imageGetters[type] = new ImageGetter(type);
            }

            imageGetters[type].on('end', () => delete imageGetters[type]);
            imageGetters[type].bind(ws);
        }

        ctx.status = 200;
    },
);

export default router;
