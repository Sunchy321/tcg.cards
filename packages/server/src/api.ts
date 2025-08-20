import { Hono } from 'hono';
import { Scalar } from '@scalar/hono-api-reference';

import { os } from '@orpc/server';
import { OpenAPIGenerator } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { experimental_SmartCoercionPlugin as SmartCoercionPlugin } from '@orpc/json-schema';

import z from 'zod';

import { games } from '@model/schema';

import { magicApi } from '@/magic/router';
import { hearthstoneApi } from '@/hearthstone/router';

const openapiGenerator = new OpenAPIGenerator({
    schemaConverters: [
        new ZodToJsonSchemaConverter(),
    ],
});

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

api.get('/openapi', async c => {
    const apiSpecs = await openapiGenerator.generate(router, {
        info: {
            title:   'tcg.cards API',
            version: '1.0.0',
        },
    });

    return c.json(apiSpecs);
});

api.get('/scalar', Scalar({
    url:     '/openapi',
    servers: [
        process.env.SERVICE_URL,
    ],
}));

export default api;
