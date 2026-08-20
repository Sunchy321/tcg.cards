import { z } from 'zod';

import { defineFactTableContract } from '../factory';

import { locale } from '@tcg-cards/model/magic/schema/basic';
import { printView } from '@tcg-cards/model/magic/schema/print';

const basic = defineFactTableContract({
  description: 'Get a print by card, set, number, language and part index',
  tags:        ['Magic', 'Print'],
  pk:          {
    cardId:    { schema: z.string() },
    set:       { schema: z.string() },
    number:    { schema: z.string() },
    lang:      { schema: locale.default('en') },
    partIndex: { schema: z.int().min(0).default(0) },
  },
  output: printView,
});

export const printRouter = { basic };
