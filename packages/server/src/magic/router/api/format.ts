import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Format from '@/magic/db/format';

import { formats } from '@/../data/magic/basic';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/format');

router.get('/', async ctx => {
    if (ctx.query.id == null) {
        const ids = await Format.find().distinct('formatId') as string[];

        ctx.body = ids.sort((a, b) => {
            const aIdx = formats.indexOf(a);
            const bIdx = formats.indexOf(b);

            if (aIdx !== -1) {
                if (bIdx !== -1) {
                    return aIdx - bIdx;
                } else {
                    return -1;
                }
            } else {
                if (bIdx !== -1) {
                    return 1;
                } else {
                    return a > b ? 1 : a < b ? -1 : 0;
                }
            }
        });
    } else {
        const format = await Format.findOne({ formatId: ctx.query.id });

        if (format == null) {
            ctx.status = 404;
            return;
        }

        ctx.body = format.toJSON();
    }
});

router.get('/timeline', async ctx => {
    if (ctx.query.id == null) {
        ctx.status = 404;
    }
});

export default router;
