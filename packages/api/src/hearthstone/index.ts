import { info } from './info';
import { catalog } from './catalog';
import { cardRouter } from './card';
import { formatRouter } from './format';
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
