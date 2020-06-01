import * as Koa from 'koa';
import * as KoaLogger from 'koa-logger';
import * as KoaBody from 'koa-body';

import router from './router';

import * as logger from './logger';

const app = new Koa();

app.use(KoaBody({ multipart: true }));
app.use(KoaLogger());

app.use(router.routes()).use(router.allowedMethods());

app.listen(8889, () => {
    logger.main.info('Server is started', { category: 'server' });
    console.log('Server is started');
});
