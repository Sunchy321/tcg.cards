import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { createReadStream, existsSync } from 'fs';
import { mapValues } from 'lodash';
import mime from 'mime-types';
import { toSingle } from '@/common/request-helper';
import { defaultIconPath, setIconPath } from '@/magic/image';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.get('/icon', async ctx => {
    const { set, rarity, 'auto-adjust': autoAdjust } = mapValues(ctx.query, toSingle);

    if (set == null || rarity == null) {
        ctx.status = 404;
        return;
    }

    const svgPath = setIconPath(set, rarity, 'svg');

    if (existsSync(svgPath)) {
        ctx.response.set('content-type', mime.lookup(svgPath) as string);
        ctx.body = createReadStream(svgPath);
        return;
    }

    // try jpg icon
    const jpgPath = setIconPath(set, rarity, 'jpg');

    if (existsSync(jpgPath)) {
        ctx.response.set('content-type', mime.lookup(jpgPath) as string);
        ctx.body = createReadStream(jpgPath);
        return;
    }

    if (autoAdjust == null) {
        ctx.status = 404;
        return;
    }

    // try set default icon
    const defaultPath = setIconPath(set, 'default', 'svg');

    if (existsSync(defaultPath)) {
        ctx.response.set('content-type', mime.lookup(defaultPath) as string);
        ctx.body = createReadStream(defaultPath);
        return;
    }

    // if set don't have a default icon while requiring a default icon, try common icon
    if (rarity === 'default') {
        const commonPath = setIconPath(set, 'common', 'svg');

        if (existsSync(commonPath)) {
            ctx.response.set('content-type', mime.lookup(commonPath) as string);
            ctx.body = createReadStream(commonPath);
            return;
        }
    }

    // use magic icon as a fallback icon
    if (existsSync(defaultIconPath)) {
        ctx.response.set('content-type', mime.lookup(defaultIconPath) as string);
        ctx.body = createReadStream(defaultIconPath);
        return;
    }

    ctx.status = 404;
});

export default router;
