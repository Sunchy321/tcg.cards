import { hearthstoneTrpc } from './hearthstone';
import { magicTrpc } from './magic';

export const router = {
  magic: magicTrpc,
  hearthstone: hearthstoneTrpc,
};

export type Router = typeof router;
