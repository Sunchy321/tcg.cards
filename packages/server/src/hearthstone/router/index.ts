import { Hono } from 'hono';

import { cardApi, cardTrpc } from './card';
import { searchTrpc } from './search';
import { patchTrpc } from './patch';
import { dataSSE, dataTrpc } from './data';

export const hearthstoneTrpc = {
    card:   cardTrpc,
    search: searchTrpc,
    patch:  patchTrpc,
    data:   dataTrpc,
};

export const hearthstoneSSE = new Hono()
    .route('/data', dataSSE);

export const hearthstoneApi = {
    card: cardApi,
};
