import { announcementTrpc } from './announcement';
import { dataSourceTrpc } from './data-source';
import { imageTrpc } from './image';
import { tagTrpc } from './tag';

export const hearthstoneTrpc = {
  announcement: announcementTrpc,
  dataSource:   dataSourceTrpc,
  image:        imageTrpc,
  tag:          tagTrpc,
};
