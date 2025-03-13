import KoaRouter from '@koa/router';

import hearthstone from '@/hearthstone/router/api';
import magic from '@/magic/router/api';
import lorcana from '@/lorcana/router/api';

import data, { Game, games } from '@static/index';

const router = new KoaRouter();

router.get('/', async ctx => {
    ctx.body = games;
});

router.use(hearthstone.routes());
router.use(magic.routes());
router.use(lorcana.routes());

router.get('/:game', async ctx => {
    const { game } = ctx.params;
    if (games.includes(game as Game)) {
        ctx.body = data[game as Game];
    } else {
        ctx.status = 404;
    }
});

export default router;
