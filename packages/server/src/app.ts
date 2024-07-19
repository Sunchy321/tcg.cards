/* eslint-disable consistent-return, @typescript-eslint/no-misused-promises */
import Koa from 'koa';
import cors from '@koa/cors';
import sslify from 'koa-sslify';
import send from 'koa-send';
import koaStatic from 'koa-static';
import session from 'koa-session';
import logger from 'koa-logger';
import body from 'koa-body';
import compress from 'koa-compress';
import websocket from 'koa-easy-ws';

import http from 'http';
import https, { ServerOptions } from 'https';
import { readFileSync } from 'fs';

import { main } from '@/logger';

import subdomain from '@/middlewares/subdomain';

import api from '@/api';
import img from '@/image';
import user from '@/user/router';
import control from '@/control';

import {
    config, clientPath, httpsSecret, HttpsSecret,
} from '@/config';

const app = new Koa();

app.keys = [config.appKey];

app
    .use(session({}, app))
    .use(cors())
    .use(sslify())
    .use(body({ multipart: true, jsonLimit: 2 * 1024 * 1024 }))
    .use(logger())
    .use(websocket())
    .use(subdomain('api', api))
    .use(subdomain('image', img))
    .use(subdomain('user', user))
    .use(subdomain('control', control))
    .use(compress({ threshold: 2048 }))
    .use(async (ctx, next) => {
        if (ctx.subdomains.length === 0) {
            return koaStatic(clientPath, {
                maxAge: 1000 * 60 * 60 * 24 * 365,
            })(ctx, next);
        }
    })
    .use(async ctx => {
        if (ctx.subdomains.length === 0) {
            return send(ctx, 'index.html', { root: clientPath });
        }
    });

const httpPort = process.env.NODE_ENV === 'production' ? 80 : 8787;

http.createServer(app.callback()).listen(httpPort, () => {
    main.info(`Server is running at ${httpPort}`, { category: 'server' });
    console.log(`Server is running at ${httpPort}`);
});

const httpsPort = process.env.NODE_ENV === 'production' ? 443 : 8889;

function createOption(option: HttpsSecret) {
    return {
        key:  readFileSync(option.key),
        cert: readFileSync(option.cert),
    } as ServerOptions;
}

const server = https.createServer(createOption(httpsSecret.default), app.callback());

server.addContext('api.tcg.cards', createOption(httpsSecret.api));
server.addContext('image.tcg.cards', createOption(httpsSecret.image));
server.addContext('user.tcg.cards', createOption(httpsSecret.user));
server.addContext('control.tcg.cards', createOption(httpsSecret.control));

server.listen(httpsPort, () => {
    main.info(`Server is running at ${httpsPort}`, { category: 'server' });
    console.log(`Server is running at ${httpsPort}`);
});
