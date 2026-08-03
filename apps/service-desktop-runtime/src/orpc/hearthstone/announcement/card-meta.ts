import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';

import { Entity, EntityLocalization } from '@tcg-cards/db/schema/local/hearthstone';
import { locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';

/** Reads the card type, mechanics, and localized name from the local DB for display. */
export const cardMeta = os
  .route({
    method:      'GET',
    description: 'Get card type, mechanics, and localized name for a cardId from the local database',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    cardId: z.string().min(1),
    lang:   locale.optional().default('zhs'),
  }))
  .output(z.object({
    type:      z.string(),
    mechanics: z.record(z.string(), z.union([z.boolean(), z.number()])),
    name:      z.string().nullable(),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const rows = await db.select({
      type:      Entity.type,
      mechanics: Entity.mechanics,
    })
      .from(Entity)
      .where(eq(Entity.cardId, input.cardId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: `Card ${input.cardId} is not imported` });
    }

    const nameRows = await db.select({ name: EntityLocalization.name })
      .from(EntityLocalization)
      .where(and(
        eq(EntityLocalization.cardId, input.cardId),
        eq(EntityLocalization.lang, input.lang),
      ))
      .orderBy(desc(EntityLocalization.updatedAt))
      .limit(1);

    return {
      type:      row.type,
      mechanics: row.mechanics as Record<string, boolean | number>,
      name:      nameRows[0]?.name ?? null,
    };
  });
