import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Format from '@/magic/db/format';

import { omit, mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import { formats } from '@/../data/magic/basic';
import { getChanges } from '@/magic/banlist/change';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/format');

router.get('/', async ctx => {
    const { id } = mapValues(ctx.query, toSingle);

    if (id != null) {
        const format = await Format.findOne({ formatId: id });

        if (format != null) {
            ctx.body = format.toJSON();
        }

        return;
    }

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
        } else if (bIdx !== -1) {
            return 1;
        } else {
            return a > b ? 1 : a < b ? -1 : 0;
        }
    });
});

router.get('/timeline', async ctx => {
    const { id } = mapValues(ctx.query, toSingle);

    if (id == null) {
        return;
    }

    const format = await Format.findOne({ formatId: id });

    if (format == null) {
        return;
    }

    const changes = await getChanges(id);

    ctx.body = changes.map(c => omit(c, '_id'));
});

export default router;
