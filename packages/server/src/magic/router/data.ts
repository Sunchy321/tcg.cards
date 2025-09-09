import { Hono } from 'hono';

import { databaseTrpc } from './data/database';
import { scryfallTrpc } from './data/scryfall';
import { gathererSSE, gathererTrpc } from './data/gatherer';

export const dataTrpc = {
    database: databaseTrpc,
    scryfall: scryfallTrpc,
    gatherer: gathererTrpc,
};

export const dataSSE = new Hono()
    .route('/gatherer', gathererSSE);
