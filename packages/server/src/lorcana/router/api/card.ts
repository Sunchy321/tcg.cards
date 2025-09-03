import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card from '@/lorcana/db/card';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

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
