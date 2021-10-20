import KoaRouter from '@koa/router';

import blizzard from './blizzard';
import card from './card';

import Patch from '@/hearthstone/db/patch';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(blizzard.routes());
router.use(card.routes());

router.get('/patches', async ctx => {
    const patches = await Patch.find().sort({ number: -1 });

    ctx.body = patches.map(p => p.json());
});

export default router;
