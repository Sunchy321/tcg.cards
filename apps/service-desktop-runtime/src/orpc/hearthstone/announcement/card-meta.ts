import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { Entity } from '@tcg-cards/db/schema/local/hearthstone';

import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';

/** Reads the card type and mechanics from the local DB for placeholder selection. */
export const cardMeta = os
  .route({
    method:      'GET',
    description: 'Get card type and mechanics for a cardId from the local database',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({ cardId: z.string().min(1) }))
  .output(z.object({
    type:      z.string(),
    mechanics: z.record(z.string(), z.union([z.boolean(), z.number()])),
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

    return {
      type:      row.type,
      mechanics: row.mechanics as Record<string, boolean | number>,
    };
  });
