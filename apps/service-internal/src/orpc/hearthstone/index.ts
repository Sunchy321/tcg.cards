import { announcementTrpc } from './announcement';
import { setTrpc } from './set';
import { tagTrpc } from './tag';

export const hearthstoneTrpc = {
  announcement: announcementTrpc,
  set:          setTrpc,
  tag:          tagTrpc,
};
