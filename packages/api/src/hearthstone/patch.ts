import { z } from 'zod';

import { defineFactTable } from '../factory';

import { Patch } from '@tcg-cards/db/schema/shared/hearthstone/patch';
import { patch as patchSchema } from '@tcg-cards/model/src/hearthstone/schema/patch';

export const detail = defineFactTable({
  description: 'Get a patch by build number',
  tags:        ['Hearthstone', 'Patch'],
  table:       Patch,
  pk:          { buildNumber: { column: Patch.buildNumber, schema: z.number().int() } },
  output:      patchSchema,
});

export const patchRouter = { detail };
