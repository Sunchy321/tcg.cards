import KoaRouter from '@koa/router';

import data from './data';
import action from './action';
// import control from './control';
import { enableControl } from '../../../config';

const router = new KoaRouter();

router.use(data.routes(), data.allowedMethods());
router.use(action.routes(), action.allowedMethods());

// if (enableControl) {
//     router.use(control.routes(), control.allowedMethods());
// }

export default router;
