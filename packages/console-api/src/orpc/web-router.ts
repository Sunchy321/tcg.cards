import { magicLight } from './magic';
import { hearthstoneLight } from './hearthstone';

export const webRouter = {
  magic:       magicLight,
  hearthstone: hearthstoneLight,
};

export type WebRouter = typeof webRouter;
