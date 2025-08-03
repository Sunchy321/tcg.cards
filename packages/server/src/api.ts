import { Hono } from 'hono';

import { magicApi } from '@/magic/router';

const api = new Hono()
    .route('/magic', magicApi);

export default api;
