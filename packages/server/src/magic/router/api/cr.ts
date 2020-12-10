import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import jwtAuth from '@/middlewares/jwt-auth';

import CR, { ICR } from '@/magic/db/cr';

import { parse } from '@/magic/cr/parse';
import { diff } from '@/magic/cr/diff';
import { readdirSync } from 'fs';
import { join } from 'path';
import { omit } from 'lodash';

import { data } from '@config';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

router.get('/', async ctx => {
    const menu = await CR.findOne({ date: ctx.query.date });

    if (menu != null) {
        ctx.body = omit(menu.toJSON(), ['_id', '__v']);
    }
});

router.get('/list', async ctx => {
    const menus = await CR.find();

    ctx.body = menus.map(m => m.date).sort();
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

router.get('/parse',
    jwtAuth({ admin: true }),
    async ctx => {
        const dir = join(data, 'magic', 'cr', 'txt');

        const txt = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));

        if (txt.includes(ctx.query.date)) {
            ctx.body = await parse(ctx.query.date);
        }
    },
);

router.post('/save',
    jwtAuth({ admin: true }),
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
