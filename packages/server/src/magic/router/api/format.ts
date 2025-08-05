import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Format from '@/magic/db/format';
import FormatChange from '@/magic/db/format-change';

import { omit, mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/format');

router.get('/changes', async ctx => {
    const { id } = mapValues(ctx.query, toSingle);

    if (id == null) {
        return;
    }

    const format = await Format.findOne({ formatId: id });

    if (format == null) {
        return;
    }

    const changes = await FormatChange.find({ format: id }).sort({ date: 1 });

    ctx.body = changes.map(c => omit(c, '_id'));
});

export default router;
