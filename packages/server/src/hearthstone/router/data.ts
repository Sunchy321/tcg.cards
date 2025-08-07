import { Hono } from 'hono';

import { hsdataRouter, hsdataSSE } from './data/hsdata';

export const dataRouter = new Hono()
    .route('/hsdata', hsdataRouter);

export const dataSSE = new Hono()
    .route('/hsdata', hsdataSSE);
