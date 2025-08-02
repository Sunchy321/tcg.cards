import { Hono } from 'hono';
import { generateSpecs } from 'hono-openapi';
import { Scalar } from '@scalar/hono-api-reference';

import { isErrorResult, merge } from 'openapi-merge';

import { magicRouter, magicSSE } from '@/magic/router';

import { auth } from './auth';
import { streamSSE } from 'hono/streaming';

const SERVICE_URL = 'service.tcg.cards';
const AUTH_PREFIX = '/api/auth';

const trpc = new Hono()
    .route('/magic', magicRouter);

const sse = new Hono()
    .route('/magic', magicSSE)
    .get('/test', async c => {
        return streamSSE(c, async stream => {
            for (let i = 0; i < 10; i++) {
                await stream.writeSSE({
                    data:  JSON.stringify({ time: new Date().toISOString(), text: `Hello ${i}` }),
                    event: 'progress',
                });

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            await stream.writeSSE({
                data:  '',
                event: 'close',
            });
        });
    });

const router = new Hono()
    .use('/*', async (c, next) => {
        if (c.req.raw.headers.get('Host') === SERVICE_URL) {
            return next();
        }
    })
    .on(['GET', 'POST'], `${AUTH_PREFIX}/*`, c => {
        return auth.handler(c.req.raw);
    })
    .route('/trpc', trpc)
    .route('/sse', sse);

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

    if (isErrorResult(specs)) {
        return c.json(null);
    }

    return c.json(specs.output);
});

router.get('/scalar', Scalar({
    url:     '/openapi',
    servers: [
        process.env.SERVICE_URL,
    ],
}));

export type Router = typeof router;

export default router;
