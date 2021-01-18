import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Set from '@/magic/db/set';

import { cardImageBase } from '@/magic/image';
import { existsSync, readdirSync } from 'fs';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.get('/', async ctx => {
    ctx.body = await Set.find().sort({ releaseDate: 1 }).distinct('setId');
});

router.get('/:id', async ctx => {
    const set = await Set.findOne({ setId: ctx.params.id });

    if (set != null) {
        ctx.body = set.toJSON();
    }
});

router.get('/:id/image-all', async ctx => {
    const set = ctx.params.id;

    const { lang, type } = ctx.query;

    if (lang == null || type == null) {
        ctx.status = 404;
        return;
    }

    const path = cardImageBase(type, set, lang);

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

export default router;
