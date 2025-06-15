import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import gatherer from './data/gatherer';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/data');

router.use(gatherer.routes());

export default router;
