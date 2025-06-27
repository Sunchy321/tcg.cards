import KoaRouter from '@koa/router';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import search from '@/lorcana/search';
import { elastic } from '@/elastic';

const router = new KoaRouter();

router.prefix('/integrated');

router.get('/search', async ctx => {
    const { q } = mapValues(ctx.query, toSingle);

    if (q == null) {
        ctx.status = 400;
        return;
    }

    ctx.body = await search.search('search', q, mapValues(ctx.query, toSingle));
});

router.get('/try-search', async ctx => {
    const result = await elastic.search({
        index: '*.cards',
        query: {
            match: {
                'parts.localization.name': '野兽',
            },
        },
    });

    ctx.body = result;
});

export default router;
