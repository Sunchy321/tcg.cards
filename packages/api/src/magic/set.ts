import { oc } from '@orpc/contract';

import z from 'zod';

import { set } from '@tcg-cards/model/magic/schema/set';

const detail = oc
  .route({
    method:      'GET',
    description: 'Get a set by id',
    tags:        ['Magic', 'Set'],
  })
  .input(z.object({ setId: z.string() }))
  .output(set);

export const setRouter = { detail };
