import { ss } from '@/search';

import { model as modelSchama } from '@model/magic/search';

import { CardPrintView, CardEditorView } from '@/magic/schema/print';

export const model = ss
    .from(modelSchama)
    .table([CardPrintView, CardEditorView]);
