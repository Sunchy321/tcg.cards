import { Hono } from 'hono';

import { cardApi, cardTrpc } from './card';
import { printApi, printTrpc } from './print';
import { searchApi, searchTrpc } from './search';
import { setApi, setTrpc } from './set';
import { formatApi, formatTrpc } from './format';
import { announcementApi, announcementTrpc } from './announcement';
import { ruleApi, ruleTrpc } from './rule';
import { dataSSE, dataTrpc } from './data';
import { imageTrpc } from './image';

export const magicTrpc = {
    card:         cardTrpc,
    search:       searchTrpc,
    print:        printTrpc,
    set:          setTrpc,
    format:       formatTrpc,
    announcement: announcementTrpc,
    rule:         ruleTrpc,
    data:         dataTrpc,
    image:        imageTrpc,
};

export const magicSSE = new Hono()
    .route('/data', dataSSE);

export const magicApi = {
    card:         cardApi,
    search:       searchApi,
    print:        printApi,
    set:          setApi,
    format:       formatApi,
    announcement: announcementApi,
    rule:         ruleApi,
};
