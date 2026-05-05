import { magicMedium } from './magic';
import { hearthstoneMedium } from './hearthstone';

export const mobileRouter = {
  magic:       magicMedium,
  hearthstone: hearthstoneMedium,
};

export type MobileRouter = typeof mobileRouter;
