import { announcementTrpc } from './announcement';
import { documentTrpc } from './document';
import { ruleTrpc } from './rule';

export const magicTrpc = {
  announcement: announcementTrpc,
  document:     documentTrpc,
  rule:         ruleTrpc,
};
