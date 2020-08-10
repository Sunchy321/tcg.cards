import KoaRouter from '@koa/router';
import { parseLog } from '../log-parser';

const router = new KoaRouter();

router.prefix('/action/hearthstone');

router.post('/parse-log', async ctx => {
    const file = ctx.request.files;

    ctx.response.body = await parseLog(file[Object.keys(file)[0]]);
});

export default router;
