/** AUTO GENERATED, DO NOT CHANGE **/

import KoaRouter from '@koa/router';

import integrated from '@/integrated/router/api';

import magic from '@/magic/router/api';
import ptcg from '@/ptcg/router/api';
import yugioh from '@/yugioh/router/api';
import hearthstone from '@/hearthstone/router/api';
import lorcana from '@/lorcana/router/api';

import { Game, games } from '@model/index';

import data from '@static/index';
import { Hono } from 'hono';

const API_URL = 'api.tcg.cards';

const router = new Hono();

router.use('/*', async (c, next) => {
    if (c.req.raw.headers.get('Host') === API_URL) {
        return next();
    }
});

router.get('/', async c => {
    return c.json(games);
});

// router.use(integrated.routes());

// router.use(magic.routes());
// router.use(ptcg.routes());
// router.use(yugioh.routes());
// router.use(hearthstone.routes());
// router.use(lorcana.routes());

// router.get('/:game', async ctx => {
//     const { game } = ctx.params;
//     if (games.includes(game as Game)) {
//         ctx.body = data[game as Game];
//     } else {
//         ctx.status = 404;
//     }
// });

export default router;
