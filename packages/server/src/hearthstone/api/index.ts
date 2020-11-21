import KoaRouter from '@koa/router';

import hsdata from './hsdata';
import blizzard from './blizzard';

import Patch from '@/hearthstone/db/patch';
import { zip } from 'lodash';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(hsdata.routes());
router.use(blizzard.routes());

router.get('/patches', async ctx => {
    const patches = await Patch.find();

    patches.sort((a, b) => {
        for (const [pa = 0, pb = 0] of zip(
            a.version.split('.').map(parseInt),
            b.version.split('.').map(parseInt),
        )) {
            if (pa < pb) {
                return 1;
            } else if (pa > pb) {
                return -1;
            }
        }

        return 0;
    });

    ctx.body = patches.map(p => p.json());
});

export default router;
