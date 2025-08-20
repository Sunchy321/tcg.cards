import { Hono } from 'hono';

import { HonoEnv } from './hono-env';

import { magicSSE, magicTrpc } from '@/magic/router';
import { hearthstoneSSE, hearthstoneTrpc } from '@/hearthstone/router';

import { auth } from './auth';

import { Game, games } from '@model/schema';

import { RPCHandler } from '@orpc/server/fetch';
import { BatchHandlerPlugin } from '@orpc/server/plugins';

const AUTH_PREFIX = '/api/auth';

export const trpc = {
    magic:       magicTrpc,
    hearthstone: hearthstoneTrpc,
};

export type TRPC = typeof trpc;

const handler = new RPCHandler(trpc, {
    plugins: [new BatchHandlerPlugin()],
});

const sse = new Hono()
    .route('/magic', magicSSE)
    .route('/hearthstone', hearthstoneSSE);

const router = new Hono<HonoEnv>()
    .on(['GET', 'POST'], `${AUTH_PREFIX}/*`, c => {
        return auth.handler(c.req.raw);
    })
    .on('POST', '/trpc/:game/data/*', async (c, next) => {
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
    .use('/trpc/*', async (c, next) => {
        const { matched, response } = await handler.handle(c.req.raw, {
            prefix:  '/trpc',
            context: {}, // Provide initial context if needed
        });

        if (matched) {
            return c.newResponse(response.body, response);
        }

        await next();
    })
    .route('/sse', sse);

export default router;
