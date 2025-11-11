import { cardApi, cardTrpc } from './card';
import { searchApi, searchTrpc } from './search';
import { printApi } from './print';
import { setApi, setTrpc } from './set';
import { formatApi, formatTrpc } from './format';
import { announcementApi, announcementTrpc } from './announcement';

export const lorcanaTrpc = {
    card:         cardTrpc,
    search:       searchTrpc,
    set:          setTrpc,
    format:       formatTrpc,
    announcement: announcementTrpc,
};

export const lorcanaApi = {
    card:         cardApi,
    search:       searchApi,
    print:        printApi,
    set:          setApi,
    format:       formatApi,
    announcement: announcementApi,
};
