import { cardTrpc } from './card';
import { patchTrpc } from './patch';
import { searchTrpc } from './search';

export const hearthstoneTrpc = {
  card:   cardTrpc,
  patch:  patchTrpc,
  search: searchTrpc,
};
