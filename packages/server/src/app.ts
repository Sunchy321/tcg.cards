import 'dotenv/config.js';

import { Hono } from 'hono';
import { showRoutes } from 'hono/dev';
import { poweredBy } from 'hono/powered-by';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

import { auth } from './auth';

import { getPath } from 'hono/utils/url';

import service from './service';
import api from './api';

const port = 3000;

const app = new Hono<{
    Variables: {
        user:    typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null;
    };
}>({
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

app.use(
    '*',
    cors({
        origin:       process.env.CLIENT_ORIGIN ?? 'https://tcg.cards:8080',
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
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

app.route('/service.tcg.cards', service);
app.route('/api.tcg.cards', api);

showRoutes(app, { verbose: true });

serve({
    fetch: app.fetch,
    port,
});

console.log(`Server is running at ${port}`);
