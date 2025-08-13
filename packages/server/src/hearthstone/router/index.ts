import { Hono } from 'hono';

import { cardRouter, cardApi } from './card';
import { patchRouter } from './patch';
import { searchRouter } from './search';
import { dataRouter, dataSSE } from './data';

export const hearthstoneRouter = new Hono()
    .route('/card', cardRouter)
    .route('/patch', patchRouter)
    .route('/search', searchRouter)
    .route('/data', dataRouter);

export const hearthstoneSSE = new Hono()
    .route('/data', dataSSE);

export const hearthstoneApi = new Hono()
    .route('/card', cardApi);
