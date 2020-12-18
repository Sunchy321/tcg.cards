import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { createReadStream, existsSync } from 'fs';
import mime from 'mime-types';
import { defaultIconPath, setIconPath } from '@/magic/image';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.get('/icon', async ctx => {
    const { set, rarity } = ctx.query;

    if (set == null || rarity == null) {
        ctx.status = 404;
        return;
    }

    let path;

    if ((path = setIconPath(set, rarity, 'svg'), existsSync(path))) {
        ctx.response.set('content-type', mime.lookup(path) as string);
        ctx.body = createReadStream(path);
        return;
    } else if ((path = setIconPath(set, rarity, 'jpg'), ctx.query['auto-adjust'] != null && existsSync(path))) {
        ctx.response.set('content-type', mime.lookup(path) as string);
        ctx.body = createReadStream(path);
        return;
    } else if ((path = setIconPath(set, 'default', 'svg'), ctx.query['auto-adjust'] != null && existsSync(path))) {
        ctx.response.set('content-type', mime.lookup(path) as string);
        ctx.body = createReadStream(path);
        return;
    } else if ((path = defaultIconPath, ctx.query['auto-adjust'] != null && existsSync(path))) {
        ctx.response.set('content-type', mime.lookup(path) as string);
        ctx.body = createReadStream(path);
        return;
    }

    ctx.status = 404;
});

export default router;
