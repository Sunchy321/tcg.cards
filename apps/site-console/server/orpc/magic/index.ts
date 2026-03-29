import { announcementTrpc } from './announcement';
import { ruleTrpc } from './rule';

export const magicTrpc = {
  announcement: announcementTrpc,
  rule:         ruleTrpc,
};
