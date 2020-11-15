import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';
import jwtAuth from '@/middlewares/jwt-auth';

import { ImageGetter } from '../scryfall/image';

import { locales } from '@data/magic/basic';
import { asset } from '@config';
import { createReadStream, existsSync, readdirSync } from 'fs';
import mime from 'mime-types';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

function imagePath(lang: string, set: string, number: string, part?: string) {
    if (part != null) {
        return `${asset}/magic/card/png/${set}/${lang}/${number}-${part}.png`;
    } else {
        return `${asset}/magic/card/png/${set}/${lang}/${number}.png`;
    }
}

router.get('/', async ctx => {
    const { lang = 'en', set, number, part } = ctx.query;

    if (set == null || number == null) {
        ctx.status = 404;
        return;
    }

    const path = imagePath(lang, set, number, part);

    if (existsSync(path)) {
        ctx.response.set('content-type', mime.lookup(path) as string);
        ctx.body = createReadStream(path);
        return;
    }

    if (ctx.query['auto-locale'] != null) {
        for (const l of locales) {
            const path = imagePath(l, set, number, part);

            if (existsSync(path)) {
                ctx.response.set('content-type', mime.lookup(path) as string);
                ctx.body = createReadStream(path);
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
    },
);

export default router;
