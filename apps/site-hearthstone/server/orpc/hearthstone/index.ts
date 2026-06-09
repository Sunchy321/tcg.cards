import { cardTrpc } from './card';
import { patchTrpc } from './patch';
import { searchTrpc } from './search';
import { testTrpc } from './test';

export const hearthstoneTrpc = {
  card:   cardTrpc,
  patch:  patchTrpc,
  search: searchTrpc,
  test:   testTrpc,
};
