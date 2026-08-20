import { games } from './games';
import { magicRouter } from './magic';
import { hearthstoneRouter } from './hearthstone';

/** Pure contract router (no handlers, no db) consumed by site-docs for introspection. */
export const registryContract = {
  games,
  magic:       magicRouter,
  hearthstone: hearthstoneRouter,
};
