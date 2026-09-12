import { databaseTrpc } from './data/database';
import { duplicateTrpc } from './data/duplicate';
import { scryfallTrpc } from './data/scryfall';
import { gathererTrpc } from './data/gatherer';
import { mtgchTrpc } from './data/mtgch';

export const dataTrpc = {
  database:  databaseTrpc,
  duplicate: duplicateTrpc,
  scryfall:  scryfallTrpc,
  gatherer:  gathererTrpc,
  mtgch:     mtgchTrpc,
};
