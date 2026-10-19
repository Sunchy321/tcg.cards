import { userConfigTrpc } from '@tcg-cards/console-api/user-config';
import { announcementTrpc } from './announcement';
import { cardTrpc } from './card';
import { formatTrpc } from './format';
import { patchTrpc } from './patch';
import { searchTrpc } from './search';
import { setTrpc } from './set';

export const hearthstoneTrpc = {
  announcement: announcementTrpc,
  card:         cardTrpc,
  format:       formatTrpc,
  patch:        patchTrpc,
  search:       searchTrpc,
  set:          setTrpc,
  userConfig:   userConfigTrpc,
};
