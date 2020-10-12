import Koa from 'koa';
import cors from '@koa/cors';
import session from 'koa-session';
import logger from 'koa-logger';
import body from 'koa-body';
import websocket from 'koa-easy-ws';
import passport from '@/user/passport';

import { main } from '@/logger';

import subdomain from './subdomain';

import apiRouter from '@/api';
import userRouter from '@/user/router';

const port = process.env.NODE_ENV === 'production' ? 80 : 8889;

const app = new Koa();

app.keys = ['secret key for tcg.cards'];

app.use(session({}, app));
app.use(cors());
app.use(body({ multipart: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(logger());
app.use(websocket());
app.use(subdomain('api', apiRouter));
app.use(subdomain('user', userRouter));

app.listen(port, () => {
    main.info('Server is running at ' + port, { category: 'server' });
    console.log('Server is running at ' + port);
});
