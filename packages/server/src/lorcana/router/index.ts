import { cardApi, cardTrpc } from './card';
import { searchApi, searchTrpc } from '../schema/search';

export const lorcanaTrpc = {
    card:   cardTrpc,
    search: searchTrpc,
};

export const lorcanaApi = {
    card:   cardApi,
    search: searchApi,
};
