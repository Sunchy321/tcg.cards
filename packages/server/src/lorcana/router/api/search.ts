import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import search from '@/lorcana/search';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/search');

router.get('/', async ctx => {
    const { q } = mapValues(ctx.query, toSingle);

    if (q == null) {
        ctx.status = 400;
        return;
    }

    ctx.body = await search.search('search', q, mapValues(ctx.query, toSingle));
});

export default router;
