import { Hono } from 'hono';

import { cardApi, cardRouter } from './card';
import { printApi } from './print';
import { searchRouter, searchApi } from './search';
import { setRouter, setApi } from './set';
import { formatApi, formatRouter } from './format';
import { ruleRouter } from './rule';
import { announcementRouter } from './announcement';
import { dataSSE } from './data';

export const magicRouter = new Hono()
    .route('/card', cardRouter)
    .route('/search', searchRouter)
    .route('/set', setRouter)
    .route('/format', formatRouter)
    .route('/announcement', announcementRouter)
    .route('/rule', ruleRouter);

export const magicSSE = new Hono()
    .route('/data', dataSSE);

export const magicApi = new Hono()
    .route('/card', cardApi)
    .route('/search', searchApi)
    .route('/print', printApi)
    .route('/set', setApi)
    .route('/format', formatApi);
