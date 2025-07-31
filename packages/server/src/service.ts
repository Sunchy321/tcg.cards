import { Hono } from 'hono';

import { generateSpecs } from 'hono-openapi';
import { merge } from 'openapi-merge';

import magic from '@/magic/router';

import { auth } from './auth';

const SERVICE_URL = 'service.tcg.cards';
const AUTH_PREFIX = '/api/auth';

const router = new Hono()
    .use('/*', async (c, next) => {
        if (c.req.raw.headers.get('Host') === SERVICE_URL) {
            return next();
        }
    })
    .on(['GET', 'POST'], `${AUTH_PREFIX}/*`, c => {
        return auth.handler(c.req.raw);
    })
    .route('/trpc', magic);

router.get('/openapi', async c => {
    const apiSpecs = await generateSpecs(router, {
        documentation: {
            info: {
                title:       'tcg.cards API',
                version:     '1.0.0',
                description: 'Greeting API',
            },
            servers: [
                { url: 'https://service.tcg.cards', description: 'tcg.cards API' },
            ],
        },
    });

    const authSpecs = await auth.api.generateOpenAPISchema();

    // atlassian-openapi disallow paths is undefined. casting schema to any to fix it.
    const specs = merge([
        { oas: apiSpecs as any },
        { oas: authSpecs as any, pathModification: { prepend: AUTH_PREFIX } },
    ]);

    return c.json(specs);
});

export type Router = typeof router;

export default router;
