import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { createReadStream, existsSync } from 'fs';
import mime from 'mime-types';
import { cardImagePath } from '@/magic/image';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import { locales } from '@data/magic/basic';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/', async ctx => {
    const {
        lang = 'en', set, number, part: partString,
    } = mapValues(ctx.query, toSingle);

    if (set == null || number == null) {
        ctx.status = 400;
        return;
    }

    const part = partString != null ? Number.parseInt(partString, 10) : undefined;

    if (partString != null && Number.isNaN(part)) {
        ctx.status = 400;
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
            const otherPngPath = cardImagePath('png', set, l, number, part);
            const otherJpgPath = cardImagePath('large', set, l, number, part);

            if (existsSync(otherPngPath)) {
                ctx.response.set('content-type', mime.lookup(otherPngPath) as string);
                ctx.body = createReadStream(otherPngPath);
                return;
            } else if (existsSync(otherJpgPath)) {
                ctx.response.set('content-type', mime.lookup(otherJpgPath) as string);
                ctx.body = createReadStream(otherJpgPath);
                return;
            }
        }
    }

    ctx.status = 404;
});

export default router;
