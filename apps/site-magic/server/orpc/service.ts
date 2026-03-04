import { magicTrpc } from './magic';

export const router = {
  magic: magicTrpc,
};

export type Router = typeof router;
