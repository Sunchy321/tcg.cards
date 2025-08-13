import { Hono } from 'hono';

import { magicApi } from '@/magic/router';
import { hearthstoneApi } from '@/hearthstone/router';

const api = new Hono()
    .route('/magic', magicApi)
    .route('/hearthstone', hearthstoneApi);

export default api;
