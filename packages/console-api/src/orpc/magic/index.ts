import { announcementTrpc } from './announcement';
import { dataSourceTrpc } from './data-source';

export const magicTrpc = {
  announcement: announcementTrpc,
  dataSource:   dataSourceTrpc,
};
