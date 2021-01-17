import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Set, { ISet } from '@/magic/db/set';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.post('/save',
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
