import { announcementTrpc } from './announcement';
import { dataSourceTrpc } from './data-source';
import { imageTrpc } from './image';

export const hearthstoneTrpc = {
  announcement: announcementTrpc,
  dataSource: dataSourceTrpc,
  image:       imageTrpc,
};
