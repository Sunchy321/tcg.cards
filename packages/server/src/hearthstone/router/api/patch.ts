import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Patch from '@/hearthstone/db/patch';

import { Patch as IPatch } from '@interface/hearthstone/patch';

import { mapValues } from 'lodash';
import { toMultiple, toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/patch');

router.get('/', async ctx => {
    const { version } = mapValues(ctx.query, toSingle);

    if (version == null) {
        const patches = await Patch.find().sort({ number: -1 });
        ctx.body = patches.map(p => p.toJSON());
        return;
    }

    const patch = await Patch.findOne({ version });

    if (patch != null) {
        const json = patch.toJSON();

        ctx.body = json;
    }
});

type PatchProfile = IPatch;

router.get('/profile', async ctx => {
    const numbers = toMultiple(ctx.query.ids ?? '');

    if (numbers == null) {
        ctx.status = 400;
        return;
    }

    const patches = await Patch.find({ number: { $in: numbers } });

    const result: Record<string, PatchProfile> = {};

    for (const p of patches) {
        result[p.number] = p.toJSON();
    }

    ctx.body = result;
});

export default router;
