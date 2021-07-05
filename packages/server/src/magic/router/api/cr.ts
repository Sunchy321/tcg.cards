import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR from '@/magic/db/cr';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';
import { diff } from '@/magic/cr/diff';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

router.get('/', async ctx => {
    const { date } = mapValues(ctx.query, toSingle);

    if (date != null) {
        const menu = await CR.findOne({ date });

        if (menu != null) {
            ctx.body = menu.toJSON();
        }

        return;
    }

    const crs = await CR.find().distinct('date') as string[];

    ctx.body = crs.sort((a, b) => a > b ? -1 : a < b ? 1 : 0);
});

router.get('/diff', async ctx => {
    const { from, to } = mapValues(ctx.query, toSingle);

    if (from == null || to == null) {
        return;
    }

    ctx.body = await diff(from, to);
});

export default router;
