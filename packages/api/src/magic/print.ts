import z from 'zod';

import { defineFactTable } from '../factory';

import { PrintView } from '@tcg-cards/db/schema/shared/magic/print';
import { locale } from '@tcg-cards/model/src/magic/schema/basic';
import { printView } from '@tcg-cards/model/src/magic/schema/print';

export const basic = defineFactTable({
  description: 'Get a print by card, set, number, language and part index',
  tags:        ['Magic', 'Print'],
  table:       PrintView,
  pk:          {
    cardId:    { column: PrintView.cardId, schema: z.string() },
    set:       { column: PrintView.set, schema: z.string() },
    number:    { column: PrintView.number, schema: z.string() },
    lang:      { column: PrintView.lang, schema: locale.default('en') },
    partIndex: { column: PrintView.partIndex, schema: z.int().min(0).default(0) },
  },
  output: printView,
});

export const printRouter = { basic };
