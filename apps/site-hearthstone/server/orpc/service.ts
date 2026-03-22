import { hearthstoneTrpc } from './hearthstone';

export const router = {
  hearthstone: hearthstoneTrpc,
};

export type Router = typeof router;
