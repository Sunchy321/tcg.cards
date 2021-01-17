import Koa from 'koa';
import cors from '@koa/cors';
import session from 'koa-session';
import logger from 'koa-logger';
import body from 'koa-body';
import websocket from 'koa-easy-ws';

import { main } from '@/logger';

import subdomain from '@/middlewares/subdomain';

import api from '@/api';
import img from '@/image';
import user from '@/user/router';
import control from '@/control';

import { appKey } from '@config';

const port = process.env.NODE_ENV === 'production' ? 80 : 8889;

const app = new Koa();

app.keys = [appKey];

app
    .use(session({}, app))
    .use(cors())
    .use(body({ multipart: true }))
    .use(logger())
    .use(websocket())
    .use(subdomain('api', api))
    .use(subdomain('image', img))
    .use(subdomain('user', user))
    .use(subdomain('control', control));

app.listen(port, () => {
    main.info('Server is running at ' + port, { category: 'server' });
    console.log('Server is running at ' + port);
});
