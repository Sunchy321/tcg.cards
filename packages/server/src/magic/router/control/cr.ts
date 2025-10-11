import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR from '@/magic/db/cr';

import CardNameExtrator from '@/magic/extract-name';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

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
