import { Hono } from 'hono';

import { cardApi, cardRouter } from './card';
import { printApi } from './print';
import { searchRouter } from './search';
import { setRouter } from './set';
import { formatApi, formatRouter } from './format';
import { dataSSE } from './data';

export const magicRouter = new Hono()
    .route('/card', cardRouter)
    .route('/search', searchRouter)
    .route('/set', setRouter)
    .route('/format', formatRouter);

export const magicSSE = new Hono()
    .route('/data', dataSSE);

export const magicApi = new Hono()
    .route('/card', cardApi)
    .route('/print', printApi)
    .route('/format', formatApi);
