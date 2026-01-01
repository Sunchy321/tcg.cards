import { ss } from '@/search/model';

import { model } from '@model/lorcana/search';

import * as commands from './command-list';
import * as actions from './action';

import { CardEditorView, CardPrintView } from '../schema/print';

export const search = ss
    .from(model)
    .table([CardPrintView, CardEditorView])
    .command(commands)
    .action(actions);
