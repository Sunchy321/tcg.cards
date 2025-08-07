import { Hono } from 'hono';
import { generateSpecs } from 'hono-openapi';
import { Scalar } from '@scalar/hono-api-reference';

import { HonoEnv } from './hono-env';

import { isErrorResult, merge } from 'openapi-merge';

import { magicRouter, magicSSE } from '@/magic/router';
import { hearthstoneRouter, hearthstoneSSE } from '@/hearthstone/router';

import { auth } from './auth';

import { Game, games } from '@model/schema';

const AUTH_PREFIX = '/api/auth';

const trpc = new Hono<HonoEnv>()
    .on('POST', '/:game/*', async (c, next) => {
        const game = c.req.param('game');

        if (games.includes(game as Game)) {
            const perm = await auth.api.userHasPermission({
                body: {
                    userId:     c.get('user')?.id,
                    permission: {
                        data: [game as Game],
                    },
                },
            });

            if (perm.error != null && !perm.success) {
                return c.json({
                    error: {
                        code:    'permission_denied',
                        message: `You do not have permission to access ${game} API.`,
                    },
                }, 403);
            }
        }

        return next();
    })
    .route('/magic', magicRouter)
    .route('/hearthstone', hearthstoneRouter);

const sse = new Hono()
    .route('/magic', magicSSE)
    .route('/hearthstone', hearthstoneSSE);

const router = new Hono<HonoEnv>()
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
        return c.notFound();
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
