import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import hearthstone from './hearthstone/router/control';
import magic from './magic/router/control';
import lorcana from './lorcana/router/control';

import jwtAuth from './middlewares/jwt-auth';

const router = new KoaRouter<DefaultState, Context>();

router.use(jwtAuth({ admin: true }));

router.use(hearthstone.routes());
router.use(magic.routes());
router.use(lorcana.routes());

export default router;
