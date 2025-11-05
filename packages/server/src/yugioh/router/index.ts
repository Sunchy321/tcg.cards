import { cardApi, cardTrpc } from './card';
import { formatApi, formatTrpc } from './format';

export const yugiohTrpc = {
    card:   cardTrpc,
    format: formatTrpc,
};

export const yugiohApi = {
    card:   cardApi,
    format: formatApi,
};
