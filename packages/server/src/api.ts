import { Hono } from 'hono';

import { os } from '@orpc/server';

import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { experimental_SmartCoercionPlugin as SmartCoercionPlugin } from '@orpc/json-schema';

import z from 'zod';

import { games } from '@model/schema';

import { magicApi } from '@/magic/router';
import { hearthstoneApi } from '@/hearthstone/router';

const root = os
    .route({
        method:      'GET',
        description: 'List all games',
    })
    .input(z.any())
    .output(z.string().array())
    .handler(() => [...games]);

const router = {
    '':            root,
    'magic':       magicApi,
    'hearthstone': hearthstoneApi,
};

const handler = new OpenAPIHandler(router, {
    plugins: [
        new SmartCoercionPlugin({
            schemaConverters: [
                new ZodToJsonSchemaConverter(),
            ],
        }),
        new OpenAPIReferencePlugin({
            docsPath:         '/scalar',
            specPath:         '/openapi',
            schemaConverters: [
                new ZodToJsonSchemaConverter(),
            ],
            specGenerateOptions: {
                info: {
                    title:   'ORPC Playground',
                    version: '1.0.0',
                },
                servers: [
                    {
                        url: process.env.API_URL!,
                    },
                ],
                components: {
                    securitySchemes: {
                        'api-key': {
                            type: 'apiKey',
                            in:   'header',
                            name: 'x-api-key',
                        },
                    },
                },
                security: [
                    { 'api-key': [] },
                ],
            },
        }),
    ],
});

const api = new Hono()
    .use('/*', async (c, next) => {
        const { matched, response } = await handler.handle(c.req.raw, {
            prefix:  '/',
            context: {}, // Provide initial context if needed
        });

        if (matched) {
            return c.newResponse(response.body, response);
        }

        await next();
    });

export default api;
