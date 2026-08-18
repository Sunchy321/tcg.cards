import { cardRouter } from './card';
import { catalog } from './catalog';
import { formatRouter } from './format';
import { info } from './info';
import { patchRouter } from './patch';
import { setRouter } from './set';
import { tagRouter } from './tag';

export const hearthstoneRouter = {
  // '' resolves /v1/hearthstone to the game info endpoint.
  '':       info,
  catalog,
  'card':   cardRouter,
  'format': formatRouter,
  'patch':  patchRouter,
  'set':    setRouter,
  'tag':    tagRouter,
};
