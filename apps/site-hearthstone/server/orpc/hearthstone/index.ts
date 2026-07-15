import { userConfigTrpc } from '@tcg-cards/console-api/user-config';
import { announcementTrpc } from './announcement';
import { cardTrpc } from './card';
import { patchTrpc } from './patch';
import { searchTrpc } from './search';

export const hearthstoneTrpc = {
  announcement: announcementTrpc,
  card:         cardTrpc,
  patch:        patchTrpc,
  search:       searchTrpc,
  userConfig:   userConfigTrpc,
};
