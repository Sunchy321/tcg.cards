import { announcementRouter } from './announcement';
import { cardRouter } from './card';
import { catalog } from './catalog';
import { formatRouter } from './format';
import { info } from './info';
import { printRouter } from './print';
import { setRouter } from './set';

export const magicRouter = {
  // '' resolves /v1/magic to the game info endpoint.
  '':             info,
  catalog,
  'card':         cardRouter,
  'announcement': announcementRouter,
  'format':       formatRouter,
  'print':        printRouter,
  'set':          setRouter,
};
