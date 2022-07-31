import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Patch from '@/hearthstone/db/patch';

import { Patch as IPatch } from '@interface/hearthstone/patch';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/patch');

router.get('/raw', async ctx => {
    const { version } = mapValues(ctx.query, toSingle);

    const patch = await Patch.findOne({ version });

    if (patch != null) {
        ctx.body = patch.toJSON();
    } else {
        ctx.status = 404;
    }
});

router.post('/save', async ctx => {
    const data = ctx.request.body.data as IPatch;

    const patch = await Patch.findOne({ version: data.version });

    if (patch != null) {
        await patch.replaceOne(data);
    } else {
        await Patch.create(data);
    }

    ctx.status = 200;
});

export default router;
