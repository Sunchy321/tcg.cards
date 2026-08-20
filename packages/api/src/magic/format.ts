import { oc } from '@orpc/contract';

import { z } from 'zod';

import { defineFactTableContract } from '../factory';

import { format as formatSchema } from '@tcg-cards/model/magic/schema/format';

const list = oc
  .route({
    method:      'GET',
    description: 'Get list of formats',
    tags:        ['Magic', 'Format'],
  })
  .output(z.string().array());

const full = defineFactTableContract({
  description: 'Get full format info',
  tags:        ['Magic', 'Format'],
  pk:          { formatId: { schema: z.string() } },
  output:      formatSchema,
});

export const formatRouter = { list, full };
