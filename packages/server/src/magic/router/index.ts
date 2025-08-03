import { Hono } from 'hono';

import { cardApi, cardRouter } from './card';
import { printApi } from './print';
import { setRouter } from './set';
import { dataSSE } from './data';

export const magicRouter = new Hono()
    .route('/card', cardRouter)
    .route('/set', setRouter);

export const magicSSE = new Hono()
    .route('/data', dataSSE);

export const magicApi = new Hono()
    .route('/card', cardApi)
    .route('/print', printApi);
