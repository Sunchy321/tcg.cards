import { ss } from '#search/server/model';

import { model } from '#model/hearthstone/search';

import * as commands from './command-list';
import * as actions from './action';

import { CardEntityView } from '#schema/hearthstone/entity';

export const search = ss
  .from(model)
  .table([CardEntityView])
  .command(commands)
  .action(actions);
