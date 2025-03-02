import KoaRouter from '@koa/router';
import send from 'koa-send';

import { assetPath } from '@/config';

const router = new KoaRouter();

router.get('/(.*)', async (ctx) => {
    const path = ctx.params[0];
    const root = assetPath;

    try {
        await send(ctx, path, { root });
    } catch (err) {
        ctx.status = 404;
        ctx.body = 'Image not found';
    }
});

export default router;
