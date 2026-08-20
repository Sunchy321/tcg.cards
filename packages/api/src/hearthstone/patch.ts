import { z } from 'zod';

import { defineFactTableContract } from '../factory';

import { patch as patchSchema } from '@tcg-cards/model/hearthstone/schema/patch';

const detail = defineFactTableContract({
  description: 'Get a patch by build number',
  tags:        ['Hearthstone', 'Patch'],
  pk:          { buildNumber: { schema: z.number().int() } },
  output:      patchSchema,
});

export const patchRouter = { detail };
