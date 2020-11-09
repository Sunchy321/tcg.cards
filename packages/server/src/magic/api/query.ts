import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/query');

export default router;
