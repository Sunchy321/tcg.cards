import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@tcg-cards/db';
import { BaseEntityLocalization, CardEntityView } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { locale } from '@tcg-cards/model/src/hearthstone/schema/basic';
import { cardEntityView } from '@tcg-cards/model/src/hearthstone/schema/entity';
import { BaseCard } from '@tcg-cards/db/schema/remote/hearthstone/index';

const maxVersion = (version: typeof CardEntityView.version) => sql<number>`
  (
    SELECT max(value)
    FROM unnest(${version}) AS version_item(value)
  )
`;

const latestOrVersion = (
  versionColumn: typeof CardEntityView.version,
  version: number | undefined,
) => version == null ? undefined : sql`${version} = any(${versionColumn})`;

export const summary = os
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
  .output(cardEntityView)
  .handler(async ({ input }) => {
    const filters = [
      eq(CardEntityView.cardId, input.cardId),
      eq(CardEntityView.lang, input.lang),
    ];
    const versionFilter = latestOrVersion(CardEntityView.version, input.version);
    if (versionFilter != null) {
      filters.push(versionFilter);
    }

    const card = await db.select().from(CardEntityView)
      .where(and(...filters))
      .orderBy(desc(maxVersion(CardEntityView.version)))
      .limit(1)
      .then(rows => rows[0]);

    if (card == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return card;
  });

export const random = os
  .route({
    method:      'GET',
    description: 'Get a random card ID',
    tags:        ['Hearthstone', 'Card'],
  })
  .output(z.string())
  .handler(async () => {
    const rows = await db.select({ cardId: BaseCard.cardId })
      .from(BaseCard);

    const pick = rows[Math.floor(Math.random() * rows.length)];

    if (pick == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return pick.cardId;
  });

export const named = os
  .route({
    method:      'GET',
    description: 'Get a card ID by exact localized name',
    tags:        ['Hearthstone', 'Card'],
  })
  .input(z.object({
    name: z.string(),
    lang: locale.default('en'),
  }))
  .output(z.string())
  .handler(async ({ input }) => {
    const row = await db.select({ cardId: BaseEntityLocalization.cardId })
      .from(BaseEntityLocalization)
      .where(and(
        eq(BaseEntityLocalization.name, input.name),
        eq(BaseEntityLocalization.lang, input.lang),
        isNull(BaseEntityLocalization.deletedAt),
      ))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return row.cardId;
  });

export const cardRouter = { summary, random, named };
