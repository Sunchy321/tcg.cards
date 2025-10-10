import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR from '@/magic/db/cr';
import { Content, CR as ICR } from '@interface/magic/cr';

import CardNameExtrator from '@/magic/extract-name';

import { parse, reparse } from '@/magic/rule/parse';
import { readdirSync } from 'fs';
import { join } from 'path';
import { isEqual, mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import { dataPath } from '@/config';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

router.get('/reparse', async ctx => {
    const { date } = mapValues(ctx.query, toSingle);

    if (date == null) {
        ctx.status = 400;
        return;
    }

    const dir = join(dataPath, 'magic', 'rule');

    const dataList = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));

    if (!dataList.includes(date)) {
        return;
    }

    const data = await reparse(date);

    const cardNames = await CardNameExtrator.names();

    for (const c of data.contents) {
        if (c.examples == null && /\w$/.test(c.text)) {
            delete c.cards;
            continue;
        }

        parseCard(c, data, cardNames);
    }

    ctx.body = data;
});

router.post('/all-reparse', async () => {
    const crs = await CR.find();

    for (const cr of crs) {
        try {
            await reparse(cr.date);
            console.log(cr.date);
        } catch (e) {
            console.log(e);
        }
    }
});

router.get('/extract-cardname', async ctx => {
    const { date, id } = mapValues(ctx.query, toSingle);

    const cr = await CR.findOne({ date });

    if (cr == null) {
        ctx.body = 400;
        return;
    }

    const content = cr.contents.find(c => c.id === id);

    if (content == null) {
        ctx.body = 400;
        return;
    }

    if (content.examples == null && /\w$/.test(content.text)) {
        delete content.cards;
        await cr.save();

        ctx.body = 200;
        return;
    }

    const cardNames = await CardNameExtrator.names();

    parseCard(content, cr, cardNames);

    await cr.save();

    ctx.status = 200;
});

router.post('/rename-all', async ctx => {
    const { old: oldValue, new: newValue } = mapValues(ctx.request.body, toSingle);

    if (oldValue == null || oldValue === '') {
        return;
    }

    if (newValue == null || newValue === '') {
        return;
    }

    await CR.find({ 'contents.id': oldValue }).cursor()
        .eachAsync(async cr => {
            for (const c of cr.contents) {
                if (c.id === oldValue && !cr.contents.some(oc => oc.id === newValue)) {
                    c.id = newValue;
                }
            }

            await cr.save();
        });

    ctx.status = 200;
});

export default router;
