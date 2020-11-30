import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { Searcher } from '@/search';
import model from '@/magic/search';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/search');

const searcher = new Searcher(model);

router.get('/', async ctx => {
    const { q } = ctx.query;

    ctx.body = await searcher.search(q, ctx.query);
});

export default router;
