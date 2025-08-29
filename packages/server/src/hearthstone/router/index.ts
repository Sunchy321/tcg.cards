import { Hono } from 'hono';

import { cardApi, cardTrpc } from './card';
import { searchTrpc } from './search';
import { patchTrpc } from './patch';
import { formatApi, formatTrpc } from './format';
import { dataSSE, dataTrpc } from './data';

export const hearthstoneTrpc = {
    card:   cardTrpc,
    search: searchTrpc,
    patch:  patchTrpc,
    format: formatTrpc,
    data:   dataTrpc,
};

export const hearthstoneSSE = new Hono()
    .route('/data', dataSSE);

export const hearthstoneApi = {
    card:   cardApi,
    format: formatApi,
};
