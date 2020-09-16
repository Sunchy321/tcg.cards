import KoaSubdomain from 'koa-subdomain';

import KoaRouter from '@koa/router';

import apiRouter from '~/api/router';

const subdomain = new KoaSubdomain();

subdomain.use('api', apiRouter.routes());

export default subdomain;
