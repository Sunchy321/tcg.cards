import { magicFull } from './magic';
import { hearthstoneFull } from './hearthstone';

export const desktopRouter = {
  magic:       magicFull,
  hearthstone: hearthstoneFull,
};

export type DesktopRouter = typeof desktopRouter;
