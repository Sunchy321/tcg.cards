import { cardApi, cardTrpc } from './card';
import { searchApi, searchTrpc } from './search';
import { printApi } from './print';
import { setApi, setTrpc } from './set';
import { formatApi, formatTrpc } from './format';

export const lorcanaTrpc = {
    card:   cardTrpc,
    search: searchTrpc,
    set:    setTrpc,
    format: formatTrpc,
};

export const lorcanaApi = {
    card:   cardApi,
    search: searchApi,
    print:  printApi,
    set:    setApi,
    format: formatApi,
};
