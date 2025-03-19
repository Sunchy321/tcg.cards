import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/log-parse');

router.post('/', async _ctx => {
    // TODO
});

export default router;
