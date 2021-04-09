import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR, { ICR } from '@/magic/db/cr';

import { parse, reparse } from '@/magic/cr/parse';
import { readdirSync } from 'fs';
import { join } from 'path';

import { data } from '@config';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

router.get('/list', async ctx => {
    const dir = join(data, 'magic', 'cr', 'data');

    ctx.body = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));
});

router.get('/txt', async ctx => {
    const dir = join(data, 'magic', 'cr', 'txt');

    ctx.body = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));
});

router.get('/parse',
    async ctx => {
        const dir = join(data, 'magic', 'cr', 'data');

        const dataList = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));

        if (dataList.includes(ctx.query.date)) {
            ctx.body = await parse(ctx.query.date);
        }
    },
);

router.get('/reparse',
    async ctx => {
        const dir = join(data, 'magic', 'cr', 'data');

        const dataList = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));

        if (dataList.includes(ctx.query.date)) {
            ctx.body = await reparse(ctx.query.date);
        }
    },
);

router.post('/save',
    async ctx => {
        const data = ctx.request.body.data as ICR;

        const cr = await CR.findOne({ date: data.date });

        if (cr != null) {
            await cr.replaceOne(data);
        } else {
            await CR.create(data);
        }

        ctx.status = 200;
    },
);

export default router;
