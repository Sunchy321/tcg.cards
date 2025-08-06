import { Hono } from 'hono';

import { patchRouter } from './patch';
import { dataSSE } from './data';

export const hearthstoneRouter = new Hono()
    .route('/patch', patchRouter);

export const hearthstoneSSE = new Hono()
    .route('/data', dataSSE);
