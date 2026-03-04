import { ss } from '#search/server/model';

import { model } from '#model/magic/search';

import * as commands from './command-list';
import * as actions from './action';

import { CardEditorView, CardPrintView } from '#schema/magic/print';

export const search = ss
  .from(model)
  .table([CardPrintView, CardEditorView])
  .command(commands)
  .action(actions);
