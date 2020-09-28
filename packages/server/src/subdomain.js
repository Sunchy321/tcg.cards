import KoaSubdomain from 'koa-subdomain';

import KoaRouter from '@koa/router';

import apiRouter from '~/api/router';
import userRouter from '~/user/router';

const subdomain = new KoaSubdomain();

subdomain.use('api', apiRouter.routes());
subdomain.use('user', userRouter.routes());

export default subdomain;
