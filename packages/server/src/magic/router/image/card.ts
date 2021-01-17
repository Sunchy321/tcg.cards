import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { createReadStream, existsSync } from 'fs';
import mime from 'mime-types';
import { cardImagePath } from '@/magic/image';

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

export default router;
