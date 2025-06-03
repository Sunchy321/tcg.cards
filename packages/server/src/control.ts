import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import integrated from './integrated/router/control';

import magic from './magic/router/control';
import yugioh from './yugioh/router/control';
import hearthstone from './hearthstone/router/control';
import lorcana from './lorcana/router/control';

import jwtAuth from './middlewares/jwt-auth';

const router = new KoaRouter<DefaultState, Context>();

router.use(jwtAuth({ admin: true }));

router.use(integrated.routes());

router.use(magic.routes());
router.use(yugioh.routes());
router.use(hearthstone.routes());
router.use(lorcana.routes());

export default router;
