import { ORPCError } from '@orpc/server';

import { and, eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { Card, CardLocalization, CardView } from '@tcg-cards/db/schema/shared/magic';

const summary = os.magic.card.summary
  .handler(async ({ input }) => {
    const view = await db.select()
      .from(CardView)
      .where(and(
        eq(CardView.cardId, input.cardId),
        eq(CardView.locale, input.locale),
        eq(CardView.partIndex, input.partIndex),
      ))
      .then(rows => rows[0]);

    if (view == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return view;
  });

const random = os.magic.card.random
  .handler(async () => {
    const cards = await db.select({ cardId: Card.cardId }).from(Card);
    const pick = cards[Math.floor(Math.random() * cards.length)];

    if (pick == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return pick.cardId;
  });

const named = os.magic.card.named
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

export const card = { summary, random, named };
