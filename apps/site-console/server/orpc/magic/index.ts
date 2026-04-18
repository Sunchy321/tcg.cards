import { announcementTrpc } from './announcement';
import { dataSourceTrpc } from './data-source';
import { ruleTrpc } from './rule';

export const magicTrpc = {
  announcement: announcementTrpc,
  dataSource:   dataSourceTrpc,
  rule:         ruleTrpc,
};
