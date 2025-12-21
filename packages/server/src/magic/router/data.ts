import { databaseTrpc } from './data/database';
import { updationTrpc } from './data/updation';
import { duplicateTrpc } from './data/duplicate';
import { scryfallTrpc } from './data/scryfall';
import { gathererTrpc } from './data/gatherer';

export const dataTrpc = {
    database:  databaseTrpc,
    updation:  updationTrpc,
    duplicate: duplicateTrpc,
    scryfall:  scryfallTrpc,
    gatherer:  gathererTrpc,
};
