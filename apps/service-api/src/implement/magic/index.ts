import { info } from './info';
import { catalog } from './catalog';
import { card } from './card';
import { print } from './print';
import { announcement } from './announcement';
import { format } from './format';
import { set } from './set';

export const magic = {
  '':             info,
  'catalog':      catalog,
  'print':        print,
  'card':         card,
  'announcement': announcement,
  'format':       format,
  'set':          set,
};
