import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Set from '@/hearthstone/db/set';

import { Set as ISet } from '@interface/hearthstone/set';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.get('/raw', async ctx => {
    const { id: setId } = mapValues(ctx.query, toSingle);

    const set = await Set.findOne({ setId });

    if (set != null) {
        ctx.body = set.toJSON();
    } else {
        ctx.status = 404;
    }
});

router.post('/save', async ctx => {
    const data = ctx.request.body.data as ISet & { _id: string };

    const set = await Set.findOne({ _id: data._id });

    if (set != null) {
        await set.replaceOne(data);
    } else {
        await Set.create(data);
    }

    ctx.status = 200;
});

export default router;
