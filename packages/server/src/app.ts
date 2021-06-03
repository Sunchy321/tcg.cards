import Koa from 'koa';
import cors from '@koa/cors';
import send from 'koa-send';
import koaStatic from 'koa-static';
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

import { config, clientPath } from '@static';

const port = process.env.NODE_ENV === 'production' ? 80 : 8889;

const app = new Koa();

app.keys = [config.appKey];

app
    .use(session({}, app))
    .use(cors())
    .use(body({ multipart: true }))
    .use(logger())
    .use(websocket())
    .use(subdomain('api', api))
    .use(subdomain('image', img))
    .use(subdomain('user', user))
    .use(subdomain('control', control))
    .use(async (ctx, next) => {
        if (ctx.subdomains.length === 0) {
            return await koaStatic(clientPath, {
                maxAge: 1000 * 60 * 60 * 24 * 365,
            })(ctx, next);
        }
    })
    .use(async ctx => {
        if (ctx.subdomains.length === 0) {
            return await send(ctx, 'index.html', { root: clientPath });
        }
    });

app.listen(port, () => {
    main.info('Server is running at ' + port, { category: 'server' });
    console.log('Server is running at ' + port);
});
