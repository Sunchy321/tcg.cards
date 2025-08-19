import { Hono } from 'hono';

import { games } from '@model/schema';

import { magicApi } from '@/magic/router';
import { hearthstoneApi } from '@/hearthstone/router';

const api = new Hono()
    .get('/', c => c.json(games))
    .route('/magic', magicApi)
    .route('/hearthstone', hearthstoneApi);

export default api;
