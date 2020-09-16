import Koa from 'koa';
import KoaCORS from '@koa/cors';
import KoaLogger from 'koa-logger';
import KoaBody from 'koa-body';

import subdomain from './subdomain';

import * as logger from './logger';

const app = new Koa();

app.use(KoaCORS());
app.use(KoaBody({ multipart: true }));
app.use(KoaLogger());
app.use(subdomain.routes());

app.listen(8889, () => {
    logger.main.info('Server is started', { category: 'server' });
    console.log('Server is started');
});
