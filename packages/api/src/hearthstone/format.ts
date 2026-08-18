import { z } from 'zod';

import { defineFactTable } from '../factory';

import { Format } from '@tcg-cards/db/schema/shared/hearthstone/format';
import { format as formatSchema } from '@tcg-cards/model/src/hearthstone/schema/format';

export const detail = defineFactTable({
  description: 'Get a format by id',
  tags:        ['Hearthstone', 'Format'],
  table:       Format,
  pk:          { formatId: { column: Format.formatId, schema: z.string() } },
  output:      formatSchema,
});

export const formatRouter = { detail };
