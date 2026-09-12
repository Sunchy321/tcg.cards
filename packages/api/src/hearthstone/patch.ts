import { z } from 'zod';

import { defineFactTableContract } from '../factory';

import { patch as patchSchema } from '@tcg-cards/model/hearthstone/schema/patch';

const detail = defineFactTableContract({
  tags:   ['Hearthstone', 'Patch'],
  pk:     { buildNumber: { schema: z.number().int() } },
  output: patchSchema,
});

export const patchRouter = { detail };
