import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { Searcher } from '@/search';
import model from '@/magic/search';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/search');

const searcher = new Searcher(model);

router.get('/', async ctx => {
    const { q } = mapValues(ctx.query, toSingle);

    if (q == null) {
        ctx.status = 400;
        return;
    }

    ctx.body = await searcher.search(q, mapValues(ctx.query, toSingle));
});

export default router;
