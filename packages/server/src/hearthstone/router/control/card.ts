/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card from '@/hearthstone/db/card';

import { Card as ICard } from '@interface/hearthstone/card';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/get-duplicate', async ctx => {
    const duplicates = await Card.aggregate<{ _id: { cardId: string, version: number } }>()
        .unwind('version')
        .group({
            _id:   { cardId: '$cardId', version: '$version' },
            count: { $sum: 1 },
        })
        .match({ count: { $gt: 1 } });

    const first = duplicates[0]?._id;

    if (first == null) {
        ctx.body = {
            total:  0,
            values: [],
        };

        return;
    }

    const cards = await Card.find({ cardId: first.cardId, version: first.version });

    ctx.body = {
        total:  duplicates.length,
        values: cards.map(c => c.toJSON()),
    };
});

router.post('/resolve-duplicate', async ctx => {
    const { data, initial } = ctx.request.body as {
        data: ICard[];
        initial: { cardId: string, version: number[] };
    };

    await Card.deleteMany(initial);

    await Card.insertMany(data);

    ctx.status = 200;
});

export default router;
