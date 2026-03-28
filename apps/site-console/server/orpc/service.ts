import { magicTrpc } from './magic';
import { hearthstoneTrpc } from './hearthstone';

export const router = {
  magic:       magicTrpc,
  hearthstone: hearthstoneTrpc,
};

export type Router = typeof router;
