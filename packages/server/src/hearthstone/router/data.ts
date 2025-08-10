import { Hono } from 'hono';

import { hsdataRouter, hsdataSSE } from './data/hsdata';
import { apolloRouter } from './data/apollo';

export const dataRouter = new Hono()
    .route('/hsdata', hsdataRouter)
    .route('/apollo', apolloRouter);

export const dataSSE = new Hono()
    .route('/hsdata', hsdataSSE);
