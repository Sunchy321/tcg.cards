import { oc } from '@orpc/contract';

import z from 'zod';

import { locale } from '@tcg-cards/model/hearthstone/schema/basic';
import { cardEntityView } from '@tcg-cards/model/hearthstone/schema/entity';

const summary = oc
  .route({
    method: 'GET',
    tags:   ['Hearthstone', 'Card'],
  })
  .input(z.object({
    cardId:  z.string(),
    lang:    locale.default('en'),
    version: z.int().min(0).optional(),
  }))
  .output(cardEntityView);

const random = oc
  .route({
    method: 'GET',
    tags:   ['Hearthstone', 'Card'],
  })
  .output(z.string());

const named = oc
  .route({
    method: 'GET',
    tags:   ['Hearthstone', 'Card'],
  })
  .input(z.object({
    name: z.string(),
    lang: locale.default('en'),
  }))
  .output(z.string());

export const cardRouter = { summary, random, named };
