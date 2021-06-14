import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Set, { ISet } from '@/magic/db/set';
import Card from '@/magic/db/card';

import { uniq } from 'lodash';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.get('/raw', async ctx => {
    const { id: setId } = ctx.query;

    const set = await Set.findOne({ setId });

    if (set != null) {
        ctx.body = set.toJSON();
    } else {
        ctx.status = 404;
    }
});

router.post('/save', async ctx => {
    const data = ctx.request.body.data as ISet;

    const set = await Set.findOne({ setId: data.setId });

    if (set != null) {
        await set.replaceOne(data);
    } else {
        await Set.create(data);
    }

    ctx.status = 200;
});

router.post('/calc', async ctx => {
    const { id } = ctx.query;

    if (id == null) {
        return;
    }

    const set = await Set.findOne({ setId: id });

    if (set == null) {
        return;
    }

    const cards = await Card.find({ set: id });

    set.cardCount = uniq(cards.map(c => c.number)).length;
    set.langs = uniq(cards.map(c => c.lang));
    set.rarities = uniq(cards.map(c => c.rarity));

    await set.save();
});

export default router;
