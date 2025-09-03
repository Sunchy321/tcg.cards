import { cardApi, cardTrpc } from './card';
import { searchApi, searchTrpc } from './search';
import { printApi } from './print';
import { setApi, setTrpc } from './set';

export const lorcanaTrpc = {
    card:   cardTrpc,
    search: searchTrpc,
    set:    setTrpc,
};

export const lorcanaApi = {
    card:   cardApi,
    search: searchApi,
    print:  printApi,
    set:    setApi,
};
