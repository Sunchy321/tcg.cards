import { cardApi, cardTrpc } from './card';
import { searchTrpc } from './search';
import { setApi, setTrpc } from './set';
import { patchTrpc } from './patch';
import { formatApi, formatTrpc } from './format';
import { announcementApi, announcementTrpc } from './announcement';
import { dataTrpc } from './data';

export const hearthstoneTrpc = {
    card:         cardTrpc,
    search:       searchTrpc,
    set:          setTrpc,
    patch:        patchTrpc,
    format:       formatTrpc,
    announcement: announcementTrpc,
    data:         dataTrpc,
};

export const hearthstoneApi = {
    card:         cardApi,
    set:          setApi,
    format:       formatApi,
    announcement: announcementApi,
};
