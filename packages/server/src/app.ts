import { Hono } from 'hono';
import { poweredBy } from 'hono/powered-by';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { compress } from '@hono/bun-compress';
import { cors } from 'hono/cors';
import { prometheus } from '@hono/prometheus';

import { HonoEnv } from './hono-env';

import { auth } from './auth';

import { getPath } from 'hono/utils/url';

import router from './service';
import api from './api';

const port = 3000;

const { printMetrics, registerMetrics } = prometheus();

const app = new Hono<HonoEnv>({
    getPath: req => {
        const path = getPath(req);
        const host = req.headers.get('Host');
        // validate the value of the host header, if necessary.
        return `/${host}${path === '/' ? '' : path}`;
    },
});

app.use(poweredBy());
app.use(logger());
app.use(prettyJSON({ space: 4 }));
app.use(compress());

app.use(
    '*',
    cors({
        origin:       process.env.CLIENT_ORIGIN ?? 'https://tcg.cards:8080',
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'x-orpc-batch',
        ],
        credentials: true,
        maxAge:      86400, // 1 day
    }),
);

app.use('*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
        c.set('user', null);
        c.set('session', null);
        return next();
    }

    c.set('user', session.user);
    c.set('session', session.session);
    return next();
});

app.use('*', registerMetrics);

app.get('/service.tcg.cards/metrics', printMetrics);
app.route('/service.tcg.cards', router);
app.route('/api.tcg.cards', api);

export default {
    port,
    fetch: app.fetch,
};
