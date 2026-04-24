import { announcementTrpc } from './announcement';
import { dataSourceTrpc } from './data-source';
import { imageTrpc } from './image';
import { setTrpc } from './set';
import { tagTrpc } from './tag';

export const hearthstoneTrpc = {
  announcement: announcementTrpc,
  dataSource:   dataSourceTrpc,
  image:        imageTrpc,
  set:          setTrpc,
  tag:          tagTrpc,
};
