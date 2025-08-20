import { Hono } from 'hono';

import { hsdataSSE, hsdataTrpc } from './data/hsdata';
import { apolloTrpc } from './data/apollo';

export const dataTrpc = {
    apollo: apolloTrpc,
    hsdata: hsdataTrpc,
};

export const dataSSE = new Hono()
    .route('/hsdata', hsdataSSE);
