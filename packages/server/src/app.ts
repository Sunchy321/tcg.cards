import 'dotenv/config.js';

import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';

import { auth } from './auth';
import { appRouter } from './router';

const port = 3000;

const app = fastify({
    logger: {
        transport: {
            target:  'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss',
                ignore:        'pid,hostname',
            },
        },
    },
});

await app.register(fastifyCors, {
    origin:         process.env.CLIENT_ORIGIN ?? 'https://tcg.cards:8080',
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
    ],
    credentials: true,
    maxAge:      86400,
});

app.route({
    method: ['GET', 'POST'],
    url:    '/api/auth/*',
    async handler(request, reply) {
        try {
            // Construct request URL
            const url = new URL(request.url, `http://${request.headers.host}`);

            // Convert Fastify headers to standard Headers object
            const headers = new Headers();
            Object.entries(request.headers).forEach(([key, value]) => {
                if (value) headers.append(key, value.toString());
            });

            // Create Fetch API-compatible request
            const req = new Request(url.toString(), {
                method: request.method,
                headers,
                body:   request.body ? JSON.stringify(request.body) : undefined,
            });

            // Process authentication request
            const response = await auth.handler(req);

            // Forward response to client
            reply.status(response.status);
            response.headers.forEach((value, key) => reply.header(key, value));
            reply.send(response.body ? await response.text() : null);
        } catch (error) {
            app.log.error('Authentication Error:', error);
            reply.status(500).send({
                error: 'Internal authentication error',
                code:  'AUTH_FAILURE',
            });
        }
    },
});

await app.register(fastifyTRPCPlugin, {
    trpcOptions: {
        router: appRouter,
    },
    prefix: '/trpc',
});

await app.listen({ port });

console.log(`Server is running at ${port}`);
