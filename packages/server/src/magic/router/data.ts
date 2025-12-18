import { databaseTrpc } from './data/database';
import { updationTrpc } from './data/updation';
import { scryfallTrpc } from './data/scryfall';
import { gathererTrpc } from './data/gatherer';

export const dataTrpc = {
    database: databaseTrpc,
    updation: updationTrpc,
    scryfall: scryfallTrpc,
    gatherer: gathererTrpc,
};
