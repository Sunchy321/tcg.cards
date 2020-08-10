import KoaRouter from '@koa/router';

import magic from './magic/router';
import hearthstone from './hearthstone/router';

import data from '../data';
import { enableControl } from '../config';

const router = new KoaRouter();

router.use(magic.routes(), magic.allowedMethods());
router.use(hearthstone.routes(), hearthstone.allowedMethods());

router.get('/basic', async (ctx) => {
    ctx.body = data;
});

router.get('/basic/enable-control', async (ctx) =>{
    ctx.body = enableControl;
});

export default router;
