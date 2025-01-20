/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Print from '@/magic/db/print';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/print');

router.get('/', async ctx => {
    const {
        id, set, number, lang,
    } = mapValues(ctx.query, toSingle);

    if (id == null || set == null || number == null || lang == null) {
        ctx.status = 400;
        return;
    }

    const print = await Print.findOne({
        cardId: id, set, number, lang,
    });

    if (print == null) {
        ctx.status = 404;
        return;
    }

    ctx.body = print.toJSON();
});

export default router;
