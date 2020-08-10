import KoaRouter from '@koa/router';
import { parseLog } from '../log-parser';

const router = new KoaRouter();

router.prefix('/data/hearthstone');

router.post('/data', async ctx => {
    const file = ctx.request.files;

    ctx.response.body = await parseLog(file[Object.keys(file)[0]]);
});

export default router;
