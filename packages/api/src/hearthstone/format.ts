import { z } from 'zod';

import { defineFactTableContract } from '../factory';

import { format } from '@tcg-cards/model/hearthstone/schema/format';

const detail = defineFactTableContract({
  tags:   ['Hearthstone', 'Format'],
  pk:     { formatId: { schema: z.string() } },
  output: format,
});

export const formatRouter = { detail };
