export * from './data-source';
export * from './announcement';
export * from './set';
export * from './tag';

import { announcementTrpc } from './announcement';
import { setTrpc } from './set';
import { tagTrpc } from './tag';

export const hearthstoneTrpc = {
  announcement: announcementTrpc,
  set:          setTrpc,
  tag:          tagTrpc,
};
