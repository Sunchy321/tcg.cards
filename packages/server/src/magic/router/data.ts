import { databaseTrpc } from './data/database';
import { scryfallTrpc } from './data/scryfall';
import { gathererTrpc } from './data/gatherer';

export const dataTrpc = {
    database: databaseTrpc,
    scryfall: scryfallTrpc,
    gatherer: gathererTrpc,
};
