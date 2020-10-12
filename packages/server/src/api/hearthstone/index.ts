import KoaRouter from '@koa/router';

import hsdata from './hsdata';

import Patch from '@/db/hearthstone/patch';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(hsdata.routes());

router.get('/patches', async ctx => {
    const patches = await Patch.find();

    ctx.body = patches.map(p => p.json());
});

export default router;
