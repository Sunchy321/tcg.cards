import { os } from './orpc';

import { games } from './implement/games';
import { magic } from './implement/magic';
import { hearthstone } from './implement/hearthstone';

export const registry = os.router({
  games,
  magic,
  hearthstone,
});
