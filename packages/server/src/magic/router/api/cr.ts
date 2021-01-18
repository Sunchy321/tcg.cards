import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR from '@/magic/db/cr';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

router.get('/', async ctx => {
    ctx.body = (await CR.find().distinct('date') as string[]).sort((a, b) => a > b ? -1 : a < b ? 1 : 0);
});

router.get('/:date', async ctx => {
    const menu = await CR.findOne({ date: ctx.params.date });

    if (menu != null) {
        ctx.body = menu.toJSON();
    }
});

export default router;
