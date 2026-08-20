import { oc } from '@orpc/contract';

import z from 'zod';

import { locale } from '@tcg-cards/model/hearthstone/schema/basic';
import { cardEntityView } from '@tcg-cards/model/hearthstone/schema/entity';

const summary = oc
  .route({
    method:      'GET',
    description: 'Get a card by ID and language at its latest (or a given) version',
    tags:        ['Hearthstone', 'Card'],
  })
  .input(z.object({
    cardId:  z.string().describe('Card ID'),
    lang:    locale.default('en').describe('Card language'),
    version: z.int().min(0).optional().describe('Explicit version to resolve'),
  }))
  .output(cardEntityView);

const random = oc
  .route({
    method:      'GET',
    description: 'Get a random card ID',
    tags:        ['Hearthstone', 'Card'],
  })
  .output(z.string());

const named = oc
  .route({
    method:      'GET',
    description: 'Get a card ID by exact localized name',
    tags:        ['Hearthstone', 'Card'],
  })
  .input(z.object({
    name: z.string(),
    lang: locale.default('en'),
  }))
  .output(z.string());

export const cardRouter = { summary, random, named };
