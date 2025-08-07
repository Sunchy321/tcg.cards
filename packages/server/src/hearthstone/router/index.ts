import { Hono } from 'hono';

import { patchRouter } from './patch';
import { dataRouter, dataSSE } from './data';

export const hearthstoneRouter = new Hono()
    .route('/patch', patchRouter)
    .route('/data', dataRouter);

export const hearthstoneSSE = new Hono()
    .route('/data', dataSSE);
