import Koa from 'koa';
import cors from '@koa/cors';
import session from 'koa-session';
import logger from 'koa-logger';
import body from 'koa-body';
import websocket from 'koa-easy-ws';

import { main } from '@/logger';

import subdomain from '@/middlewares/subdomain';

import apiRouter from '@/api';
import userRouter from '@/user/router';

const port = process.env.NODE_ENV === 'production' ? 80 : 8889;

const app = new Koa();

app.keys = ['secret key for tcg.cards'];

app
    .use(session({}, app))
    .use(cors())
    .use(body({ multipart: true }))
    .use(logger())
    .use(websocket())
    .use(subdomain('api', apiRouter))
    .use(subdomain('user', userRouter));

app.listen(port, () => {
    main.info('Server is running at ' + port, { category: 'server' });
    console.log('Server is running at ' + port);
});
