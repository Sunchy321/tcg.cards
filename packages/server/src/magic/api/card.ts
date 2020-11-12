import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import jwtAuth from '@/middlewares/jwt-auth';

import Card, { ICard } from '../db/card';
import { Document } from 'mongoose';

import { omitBy, random } from 'lodash';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/', async ctx => {
    const { id: cardId, lang, set: setId, number } = ctx.query;

    const aggregate = Card.aggregate();

    aggregate.match(omitBy({ cardId, setId, number }, v => v == null));

    if (lang != null) {
        aggregate.addFields({ langIsQuery: { $eq: ['$lang', lang] } });
    }

    aggregate.addFields({ langIsEnglish: { $eq: ['$lang', 'en'] } });
    aggregate.sort({ langIsQuery: -1, langIsEnglish: -1, releaseDate: -1 });
    aggregate.limit(1);

    const cards = await aggregate;
    const versions = await Card.aggregate()
        .match({ cardId })
        .sort({ releaseDate: -1 })
        .project('-_id lang setId number');

    if (cards.length !== 0) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _id, __v, ...data } = cards[0];

        ctx.body = {
            ...data,
            versions: versions.map(({ lang, setId, number }) => ({ lang, set: setId, number })),
        };
    } else {
        ctx.status = 404;
    }
});

router.get('/random', async ctx => {
    const cardId = await Card.distinct('cardId');

    ctx.body = cardId[random(cardId.length - 1)];
});

router.get('/raw',
    jwtAuth({ admin: true }),
    async ctx => {
        const { id: cardId, lang, set: setId, number } = ctx.query;

        const card = await Card.findOne({ cardId, lang, setId, number });

        if (card != null) {
            ctx.body = card.toJSON();
        } else {
            ctx.status = 404;
        }
    },
);

async function tryUpdate(
    oldCard: ICard & Document,
    newCard: ICard & { _id: string },
    index: number,
    firstKey: 'oracle' | 'unified',
    lastKey: 'name' | 'typeline' | 'text',
) {
    const oldValue = oldCard.parts[index][firstKey][lastKey];
    const newValue = newCard.parts[index][firstKey][lastKey];

    if (oldValue !== newValue) {
        if (firstKey === 'oracle') {
            await Card.updateMany(
                { cardId: newCard.cardId },
                { $set: { [`parts.${index}.${firstKey}.${lastKey}`]: newValue } },
            );
        } else {
            await Card.updateMany(
                { cardId: newCard.cardId, lang: newCard.lang },
                { $set: { [`parts.${index}.${firstKey}.${lastKey}`]: newValue } },
            );
        }
    }
}

router.post('/update',
    jwtAuth({ admin: true }),
    async ctx => {
        const data: ICard & { _id: string } = ctx.request.body.data;

        const old = await Card.findById(data._id);

        if (old != null) {
            for (let i = 0; i < data.parts.length; ++i) {
                await tryUpdate(old, data, i, 'oracle', 'name');
                await tryUpdate(old, data, i, 'oracle', 'typeline');
                await tryUpdate(old, data, i, 'oracle', 'text');
                await tryUpdate(old, data, i, 'unified', 'name');
                await tryUpdate(old, data, i, 'unified', 'typeline');
                await tryUpdate(old, data, i, 'unified', 'text');
            }

            await old.replaceOne(data);

            ctx.status = 200;
        } else {
            ctx.status = 404;
        }
    },
);

export default router;
