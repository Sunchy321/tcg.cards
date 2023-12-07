import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Patch from '@/hearthstone/db/patch';
import Card from '@/hearthstone/db/card';

import { Patch as IPatch } from '@interface/hearthstone/patch';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/patch');

router.get('/', async ctx => {
    const { version } = mapValues(ctx.query, toSingle);

    if (version == null) {
        const patches = await Patch.find().sort({ number: -1 });

        const duplicates = await Card.aggregate<{ _id: { cardId: string, version: number } }>()
            .unwind('version')
            .group({
                _id:   { cardId: '$cardId', version: '$version' },
                count: { $sum: 1 },
            })
            .match({ count: { $gt: 1 } });

        ctx.body = patches.map(p => ({
            ...p.toJSON(),
            duplicate: duplicates.filter(d => d._id.version === p.number).length,
        }));
    } else {
        const patch = await Patch.findOne({ version });

        if (patch != null) {
            const json = patch.toJSON();

            ctx.body = json;
        }
    }
});

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
