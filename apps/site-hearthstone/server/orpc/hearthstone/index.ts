import { userConfigTrpc } from '@tcg-cards/console-api/user-config';
import { cardTrpc } from './card';
import { patchTrpc } from './patch';
import { searchTrpc } from './search';

export const hearthstoneTrpc = {
  card:       cardTrpc,
  patch:      patchTrpc,
  search:     searchTrpc,
  userConfig: userConfigTrpc,
};
