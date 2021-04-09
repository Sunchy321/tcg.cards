import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Format from '@/magic/db/format';

import { omit } from 'lodash';

import { formats } from '@/../data/magic/basic';
import { getChanges } from '@/magic/change';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/format');

router.get('/', async ctx => {
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
});

router.get('/:id', async ctx => {
    const format = await Format.findOne({ formatId: ctx.params.id });

    if (format == null) {
        ctx.status = 404;
        return;
    }

    ctx.body = format.toJSON();
});

router.get('/:id/timeline', async ctx => {
    const id = ctx.params.id;

    const format = await Format.findOne({ formatId: id });

    if (format == null) {
        ctx.status = 404;
        return;
    }

    const changes = await getChanges(ctx.params.id);

    ctx.body = changes.map(c => omit(c, '_id'));
});

export default router;
