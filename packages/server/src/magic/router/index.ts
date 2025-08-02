import { Hono } from 'hono';

import { cardRouter } from './card';
import { setRouter } from './set';
import { dataSSE } from './data';

export const magicRouter = new Hono()
    .route('/card', cardRouter)
    .route('/set', setRouter);

export const magicSSE = new Hono()
    .route('/data', dataSSE);
