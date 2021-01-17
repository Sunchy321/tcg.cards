import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR from '@/magic/db/cr';
import { diff } from '@/magic/cr/diff';
import { readdirSync } from 'fs';
import { join } from 'path';

import { data } from '@config';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

router.get('/', async ctx => {
    const { date } = ctx.query;

    if (date == null) {
        ctx.body = (await CR.find().distinct('date') as string[]).sort((a, b) => a > b ? -1 : a < b ? 1 : 0);
    } else {
        const menu = await CR.findOne({ date: ctx.query.date });

        if (menu != null) {
            ctx.body = menu.toJSON();
        }
    }
});

router.get('/txt', async ctx => {
    const dir = join(data, 'magic', 'cr', 'txt');

    ctx.body = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));
});

router.get('/diff', async ctx => {
    const { from, to } = ctx.query;

    if (from == null || to == null) {
        return;
    }

    ctx.body = await diff(from, to);
});

export default router;
