import { z } from 'zod';

import { defineFactTableContract } from '../factory';

import { tagProfile } from '@tcg-cards/model/hearthstone/schema/tag';

const detail = defineFactTableContract({
  description: 'Get a tag by enum id',
  tags:        ['Hearthstone', 'Tag'],
  pk:          { enumId: { schema: z.number().int() } },
  output:      tagProfile,
});

export const tagRouter = { detail };
