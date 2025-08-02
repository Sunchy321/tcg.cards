import { Hono } from 'hono';

import { gathererSSE } from './data/gatherer';

export const dataSSE = new Hono()
    .route('/gatherer', gathererSSE);
