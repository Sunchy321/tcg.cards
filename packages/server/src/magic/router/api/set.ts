import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

// import jwtAuth from '@/middlewares/jwt-auth';

import Set from '@/magic/db/set';

import { omitBy } from 'lodash';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.get('/', async ctx => {
    const { id } = ctx.query;

    if (id == null) {
        ctx.body = await Set.find().sort({ releaseDate: 1 }).distinct('setId');
    } else {
        const set = await Set.findOne({ setId: id });

        if (set != null) {
            ctx.body = omitBy(set.toJSON(), ['_id', '__v']);
        }
    }
});

export default router;
