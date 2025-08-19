import { Hono } from 'hono';
import { generateSpecs } from 'hono-openapi';
import { Scalar } from '@scalar/hono-api-reference';

import { games } from '@model/schema';

import { magicApi } from '@/magic/router';
import { hearthstoneApi } from '@/hearthstone/router';

const api = new Hono()
    .get('/', c => c.json(games))
    .route('/magic', magicApi)
    .route('/hearthstone', hearthstoneApi);

api.get('/openapi', async c => {
    const apiSpecs = await generateSpecs(api, {
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

    return c.json(apiSpecs);
});

api.get('/scalar', Scalar({
    url:     '/openapi',
    servers: [
        process.env.SERVICE_URL,
    ],
}));

export default api;
