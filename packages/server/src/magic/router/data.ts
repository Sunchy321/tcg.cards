import { Hono } from 'hono';

import { gathererSSE, gathererTrpc } from './data/gatherer';

export const dataTrpc = {
    gatherer: gathererTrpc,
};

export const dataSSE = new Hono()
    .route('/gatherer', gathererSSE);
