import KoaRouter from '@koa/router';
import { Context } from 'koa';

import { FormatModel } from '~/db/magic/model/format';
import { SetModel } from '~/db/magic/model/set';

const router = new KoaRouter();

router.prefix('/data/magic');

router.get('/formats', async ctx => {
    const formats = await FormatModel.find().sort({ order: 1 });

    ctx.body = formats.map(f => f.formatId);
});

router.get('/sets', async ctx => {
    const sets = await SetModel.find().sort({ releaseDate: -1, setId: 1 });

    ctx.body = sets.map(s => s.setId);
});

export default router;
