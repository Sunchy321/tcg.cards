import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import jwtAuth from '@/middlewares/jwt-auth';

import Set, { ISet } from '@/magic/db/set';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.get('/', async ctx => {
    const { id } = ctx.query;

    if (id == null) {
        ctx.body = await Set.find().sort({ releaseDate: 1 }).distinct('setId');
    } else {
        const set = await Set.findOne({ setId: id });

        if (set != null) {
            ctx.body = set.toJSON();
        }
    }
});

router.post('/save',
    jwtAuth({ admin: true }),
    async ctx => {
        const data = ctx.request.body.data as ISet;

        const cr = await Set.findOne({ setId: data.setId });

        if (cr != null) {
            await cr.replaceOne(data);
        } else {
            await Set.create(data);
        }

        ctx.status = 200;
    },
);

export default router;
