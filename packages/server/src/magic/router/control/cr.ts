import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR from '@/magic/db/cr';
import { CR as ICR } from '@interface/magic/cr';

import CardNameExtrator from '@/magic/extract-name';

import { parse, reparse } from '@/magic/cr/parse';
import { readdirSync } from 'fs';
import { join } from 'path';
import { isEqual, mapValues } from 'lodash';
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
    const { date } = mapValues(ctx.query, toSingle);

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
    const { date } = mapValues(ctx.query, toSingle);

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

    const cardNames = await CardNameExtrator.names();

    for (const c of data.contents) {
        if (c.examples == null && /\w$/.test(c.text)) {
            delete c.cards;
            continue;
        }

        const blacklist = [];

        // Keywords are not treated as card name in its clause
        if (/^70[12]/.test(c.index) && c.depth > 2) {
            const parent = data.contents.find(co => co.depth === 2
                && c.index.slice(0, -1) === co.index.slice(0, -1)
                && /\w$/.test(co.text));

            if (parent != null) {
                blacklist.push(parent.text);
            }
        }

        const cards = new CardNameExtrator({ text: c.text, cardNames, blacklist }).extract();

        for (const e of c.examples ?? []) {
            const exampleCards = new CardNameExtrator({ text: e, cardNames, blacklist }).extract();

            for (const c of exampleCards) {
                if (!cards.some(v => isEqual(c, v))) {
                    cards.push(c);
                }
            }
        }

        if (cards.length > 0) {
            c.cards = cards;
        } else {
            delete c.cards;
        }
    }

    const cr = await CR.findOne({ date: data.date });

    if (cr != null) {
        await cr.replaceOne(data);
    } else {
        await CR.create(data);
    }

    ctx.status = 200;
});

export default router;
