import * as KoaRouter from 'koa-router';

import data from './data';
import control from './control';
import { enableConsole } from '../../../data/config';

const router = new KoaRouter();

router.use(data.routes(), data.allowedMethods());

if (enableConsole) {

}

export default router;
