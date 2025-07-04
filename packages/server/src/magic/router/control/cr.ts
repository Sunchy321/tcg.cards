import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR from '@/magic/db/cr';
import { Content, CR as ICR } from '@interface/magic/cr';

import CardNameExtrator from '@/magic/extract-name';

import { parse, reparse } from '@/magic/cr/parse';
import { readdirSync } from 'fs';
import { join } from 'path';
import { isEqual, mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import { dataPath } from '@/config';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

router.get('/list', async ctx => {
    const dir = join(dataPath, 'magic', 'rule');

    ctx.body = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));
});

router.get('/parse', async ctx => {
    const { date } = mapValues(ctx.query, toSingle);

    if (date == null) {
        ctx.status = 400;
        return;
    }

    const dir = join(dataPath, 'magic', 'rule');

    const dataList = readdirSync(dir).filter(t => t.endsWith('txt')).map(t => t.slice(0, -4));

    if (dataList.includes(date)) {
        ctx.body = await parse(date);
    }
});

function parseCard(c: Content, data: ICR, cardNames: { id: string, name: string[] }[]) {
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

router.post('/save', async ctx => {
    const data = ctx.request.body.data as ICR;

    const oldData = await CR.findOne({ date: data.date });

    const cardNames = await CardNameExtrator.names();

    for (const c of data.contents) {
        if (c.examples == null && /\w$/.test(c.text)) {
            delete c.cards;
            continue;
        }

        if (oldData != null) {
            const oldItem = oldData.contents.find(co => co.text === c.text);

            if (oldItem != null) {
                continue;
            }
        }

        parseCard(c, data, cardNames);
    }

    if (oldData != null) {
        await oldData.replaceOne(data);
    } else {
        await CR.create(data);
    }

    ctx.status = 200;
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
