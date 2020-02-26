import * as KoaRouter from 'koa-router';

import magic from './magic/router';
import hearthstone from './hearthstone/router';

import data from '../data';

const router = new KoaRouter();

router.use(magic.routes(), magic.allowedMethods());
router.use(hearthstone.routes(), hearthstone.allowedMethods());

router.get('/basic', async (ctx) => {
    ctx.body = data;
});

export default router;
