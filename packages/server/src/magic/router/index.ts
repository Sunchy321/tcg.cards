import { cardApi, cardTrpc } from './card';
import { printApi, printTrpc } from './print';
import { searchApi, searchTrpc } from './search';
import { setApi, setTrpc } from './set';
import { formatApi, formatTrpc } from './format';
import { announcementApi, announcementTrpc } from './announcement';
import { ruleApi, ruleTrpc } from './rule';
import { dataTrpc } from './data';

export const magicTrpc = {
    card:         cardTrpc,
    search:       searchTrpc,
    print:        printTrpc,
    set:          setTrpc,
    format:       formatTrpc,
    announcement: announcementTrpc,
    rule:         ruleTrpc,
    data:         dataTrpc,
};

export const magicApi = {
    card:         cardApi,
    search:       searchApi,
    print:        printApi,
    set:          setApi,
    format:       formatApi,
    announcement: announcementApi,
    rule:         ruleApi,
};
