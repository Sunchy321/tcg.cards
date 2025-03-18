import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import Card from '@/hearthstone/db/card';

import { mapValues, random } from 'lodash';

import { toMultiple, toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/', async ctx => {
    const { id } = mapValues(ctx.query, toSingle);

    if (id == null) {
        ctx.status = 400;
        return;
    }

    const card = await Card.findOne({ cardId: id });

    if (card == null) {
        ctx.status = 404;
        return;
    }

    ctx.body = card.toJSON();
});

router.get('/random', async ctx => {
    const cardIds = await Card.distinct('cardId');

    ctx.body = cardIds[random(cardIds.length - 1)] ?? '';
});

interface CardProfile {
    cardId: string;
}

router.get('/profile', async ctx => {
    const ids = toMultiple(ctx.query.ids ?? '');

    if (ids.length === 0) {
        ctx.status = 400;
        return;
    }

    const fullCards = await Card.find({ cardId: { $in: ids } });

    const result: Record<string, CardProfile> = {};

    for (const id of ids) {
        const card = fullCards.find(e => e.cardId === id);

        if (card == null) {
            continue;
        }

        result[id] = {
            cardId: card.cardId,
        };
    }

    ctx.body = result;
});

export default router;
