import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { diff } from '@/magic/cr/diff';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr-diff');

router.get('/', async ctx => {
    const { from, to } = ctx.query;

    if (from == null || to == null) {
        return;
    }

    ctx.body = await diff(from, to);
});

export default router;
