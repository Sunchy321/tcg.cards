import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import gatherer from './data/hsdata';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/data');

router.use(gatherer.routes());

export default router;
