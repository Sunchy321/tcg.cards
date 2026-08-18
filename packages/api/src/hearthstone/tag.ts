import { z } from 'zod';

import { defineFactTable } from '../factory';

import { Tag } from '@tcg-cards/db/schema/shared/hearthstone/tag';
import { tagProfile } from '@tcg-cards/model/src/hearthstone/schema/tag';

export const detail = defineFactTable({
  description: 'Get a tag by enum id',
  tags:        ['Hearthstone', 'Tag'],
  table:       Tag,
  pk:          { enumId: { column: Tag.enumId, schema: z.number().int() } },
  output:      tagProfile,
});

export const tagRouter = { detail };
