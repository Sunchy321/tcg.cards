import { oc } from '@orpc/contract';

import z from 'zod';

import { defineFactTableContract } from '../factory';

import { locale } from '@tcg-cards/model/magic/schema/basic';
import { cardView } from '@tcg-cards/model/magic/schema/card';

const summary = defineFactTableContract({
  description: 'Get a card view by ID, locale and part index',
  tags:        ['Magic', 'Card'],
  pk:          {
    cardId:    { schema: z.string() },
    locale:    { schema: locale.default('en') },
    partIndex: { schema: z.int().min(0).default(0) },
  },
  output: cardView,
});

const random = oc
  .route({
    method:      'GET',
    description: 'Get a random card ID',
    tags:        ['Magic', 'Card'],
  })
  .output(z.string());

const named = oc
  .route({
    method:      'GET',
    description: 'Get a card ID by exact localized name',
    tags:        ['Magic', 'Card'],
  })
  .input(z.object({
    name:   z.string(),
    locale: locale.default('en'),
  }))
  .output(z.string());

export const cardRouter = { summary, random, named };
