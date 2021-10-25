import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR from '@/magic/db/cr';
import { CR as ICR } from '@interface/magic/cr';

import { parse, reparse } from '@/magic/cr/parse';
import { readdirSync } from 'fs';
import { join } from 'path';
import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import { dataPath } from '@static';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

router.get('/list', async ctx => {
    const dir = join(dataPath, 'magic', 'cr', 'data');

    ctx.body = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));
});

router.get('/txt', async ctx => {
    const dir = join(dataPath, 'magic', 'cr', 'txt');

    ctx.body = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));
});

router.get('/parse', async ctx => {
    const date = mapValues(ctx.query, toSingle).date;

    if (date == null) {
        ctx.status = 400;
        return;
    }

    const dir = join(dataPath, 'magic', 'cr', 'data');

    const dataList = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));

    if (dataList.includes(date)) {
        ctx.body = await parse(date);
    }
});

router.get('/reparse', async ctx => {
    const date = mapValues(ctx.query, toSingle).date;

    if (date == null) {
        ctx.status = 400;
        return;
    }

    const dir = join(dataPath, 'magic', 'cr', 'data');

    const dataList = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));

    if (dataList.includes(date)) {
        ctx.body = await reparse(date);
    }
});

router.post('/save', async ctx => {
    const data = ctx.request.body.data as ICR;

    const cr = await CR.findOne({ date: data.date });

    if (cr != null) {
        await cr.replaceOne(data);
    } else {
        await CR.create(data);
    }

    ctx.status = 200;
});

export default router;
