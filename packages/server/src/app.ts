/* eslint-disable consistent-return, @typescript-eslint/no-misused-promises */
import Koa from 'koa';
import cors from '@koa/cors';
import session from 'koa-session';
import logger from 'koa-logger';
import body from 'koa-body';
import compress from 'koa-compress';
import websocket from 'koa-easy-ws';

import { main } from '@/logger';

import subdomain from '@/middlewares/subdomain';

import api from '@/api';
import img from '@/image';
import user from '@/user/router';
import control from '@/control';
import asset from '@/asset';

import { config } from '@/config';

const app = new Koa();

app.keys = [config.appKey];

const port = process.env.NODE_ENV === 'production' ? 3000 : 8889;

app
    .use(session({}, app))
    .use(cors())
    .use(body({ multipart: true, jsonLimit: 2 * 1024 * 1024 }))
    .use(logger())
    .use(websocket())
    .use(subdomain('api', api))
    .use(subdomain('image', img))
    .use(subdomain('asset', asset))
    .use(subdomain('user', user))
    .use(subdomain('control', control))
    .use(compress({ threshold: 2048 }));

app.listen(port, () => {
    main.info(`Server is running at ${port}`, { category: 'server' });
    console.log(`Server is running at ${port}`);
});
