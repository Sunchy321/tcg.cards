import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { db } from '@/drizzle';
import { Patch } from '@/hearthstone/schema/patch';

import { Patch as IPatch } from '@interface/hearthstone/patch';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/patch');

router.post('/save', async ctx => {
    const data = ctx.request.body.data as IPatch;

    await db.insert(Patch)
        .values(data)
        .onConflictDoUpdate({
            target: Patch.name,
            set:    data,
        });

    ctx.status = 200;
});

export default router;
