import { oc } from '@orpc/contract';

import { z } from 'zod';

import { defineFactTableContract } from '../factory';

import { format as formatSchema } from '@tcg-cards/model/magic/schema/format';

const list = oc
  .route({
    method: 'GET',
    tags:   ['Magic', 'Format'],
  })
  .output(z.string().array());

const full = defineFactTableContract({
  tags:   ['Magic', 'Format'],
  pk:     { formatId: { schema: z.string() } },
  output: formatSchema,
});

export const formatRouter = { list, full };
