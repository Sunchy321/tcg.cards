import { cardApi, cardTrpc } from './card';
import { searchApi, searchTrpc } from './search';
import { setApi, setTrpc } from './set';

export const lorcanaTrpc = {
    card:   cardTrpc,
    search: searchTrpc,
    set:    setTrpc,
};

export const lorcanaApi = {
    card:   cardApi,
    search: searchApi,
    set:    setApi,
};
