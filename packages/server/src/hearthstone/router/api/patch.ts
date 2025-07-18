import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { db } from '@/drizzle';
import { Patch } from '@/hearthstone/schema/patch';

import { Patch as IPatch } from '@interface/hearthstone/patch';

import { desc, eq } from 'drizzle-orm';
import { mapValues } from 'lodash';
import { toMultiple, toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/patch');

router.get('/', async ctx => {
    const { number: buildNumberText } = mapValues(ctx.query, toSingle);

    if (buildNumberText == null) {
        const values = await db.select().from(Patch).orderBy(desc(Patch.buildNumber));

        ctx.body = values;
        return;
    }

    const buildNumber = Number.parseInt(buildNumberText, 10);

    if (Number.isNaN(buildNumber)) {
        ctx.status = 400;
        return;
    }

    const value = await db.select().from(Patch).where(eq(Patch.buildNumber, buildNumber)).limit(1);

    if (value.length == 0) {
        ctx.status = 404;
        return;
    }

    ctx.body = value[0];
});

// type PatchProfile = Patch;

// router.get('/profile', async ctx => {
//     const numbers = toMultiple(ctx.query.ids ?? '');

//     if (numbers == null) {
//         ctx.status = 400;
//         return;
//     }

//     const patches = await Patch.find({ number: { $in: numbers } });

//     const result: Record<string, PatchProfile> = {};

//     for (const p of patches) {
//         result[p.number] = p.toJSON();
//     }

//     ctx.body = result;
// });

export default router;
