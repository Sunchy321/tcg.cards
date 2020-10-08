import Koa from 'koa';
import KoaCORS from '@koa/cors';
import KoaSession from 'koa-session';
import KoaLogger from 'koa-logger';
import KoaBody from 'koa-body';

import passport from '~/user/passport';

import subdomain from './subdomain';

import * as logger from './logger';

const port = process.env.NODE_ENV === 'production' ? 80 : 8889;

const app = new Koa();

app.keys = ['secret key for tcg.cards'];

app.use(KoaSession({}, app));
app.use(KoaCORS());
app.use(KoaBody({ multipart: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(KoaLogger());
app.use(subdomain.routes());

app.listen(port, () => {
    logger.main.info('Server is running at ' + port, { category: 'server' });
    console.log('Server is running at ' + port);
});
