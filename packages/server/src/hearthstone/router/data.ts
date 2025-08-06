import { Hono } from 'hono';

import { hsdataSSE } from './data/hsdata';

export const dataSSE = new Hono()
    .route('/hsdata', hsdataSSE);
