import { magicRouter } from './magic';
import { hearthstoneRouter } from './hearthstone';
import { games } from './games';

export const registry = {
  games,
  magic: magicRouter,
  hearthstone: hearthstoneRouter,
};
