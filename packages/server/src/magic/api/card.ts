import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';
import { omitBy, random } from 'lodash';

import Card from '../db/card';

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

export default router;
