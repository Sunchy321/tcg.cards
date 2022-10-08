import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import { readFileSync } from 'fs';
import { parseLog } from 'hs-log-parser';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/log-parse');

router.post('/', async ctx => {
    // if (ctx.request.files == null) { return; }

    // const fileNames = Object.keys(ctx.request.files);

    // if (fileNames.length !== 1) { return; }

    // const file = ctx.request.files[fileNames[0]];

    // if (Array.isArray(file)) { return; }

    // const { path } = file;

    // const text = readFileSync(path).toString();

    // try {
    //     ctx.body = parseLog(text);
    // } catch (err) {
    //     console.error(err.message);
    //     ctx.status = 400;
    //     ctx.body = err.message;
    // }
});

export default router;
