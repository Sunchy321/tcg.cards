import { oc } from '@orpc/contract';

import z from 'zod';

import { set as setSchema } from '@tcg-cards/model/hearthstone/schema/set';

const detail = oc
  .route({
    method:      'GET',
    description: 'Get a set by id',
    tags:        ['Hearthstone', 'Set'],
  })
  .input(z.object({ setId: z.string() }))
  .output(setSchema);

export const setRouter = { detail };
