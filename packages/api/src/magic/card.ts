import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { and, eq } from 'drizzle-orm';

import { defineFactTable } from '../factory';

import { db } from '@tcg-cards/db';
import { Card, CardLocalization, CardView } from '@tcg-cards/db/schema/shared/magic';
import { locale } from '@tcg-cards/model/src/magic/schema/basic';
import { cardView } from '@tcg-cards/model/src/magic/schema/card';

export const summary = defineFactTable({
  description: 'Get a card view by ID, locale and part index',
  tags:        ['Magic', 'Card'],
  table:       CardView,
  pk:          {
    cardId:    { column: CardView.cardId, schema: z.string() },
    locale:    { column: CardView.locale, schema: locale.default('en') },
    partIndex: { column: CardView.partIndex, schema: z.int().min(0).default(0) },
  },
  output: cardView,
});

export const random = os
  .route({
    method:      'GET',
    description: 'Get a random card ID',
    tags:        ['Magic', 'Card'],
  })
  .output(z.string())
  .handler(async () => {
    const cards = await db.select({ cardId: Card.cardId }).from(Card);
    const pick = cards[Math.floor(Math.random() * cards.length)];

    if (pick == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return pick.cardId;
  });

export const named = os
  .route({
    method:      'GET',
    description: 'Get a card ID by exact localized name',
    tags:        ['Magic', 'Card'],
  })
  .input(z.object({
    name:   z.string(),
    locale: locale.default('en'),
  }))
  .output(z.string())
  .handler(async ({ input }) => {
    const row = await db.select({ cardId: CardLocalization.cardId })
      .from(CardLocalization)
      .where(and(
        eq(CardLocalization.name, input.name),
        eq(CardLocalization.locale, input.locale),
      ))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return row.cardId;
  });

export const cardRouter = { summary, random, named };
