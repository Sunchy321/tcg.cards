import { os } from '@orpc/server';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { Entity, EntityLocalization } from '@tcg-cards/db/schema/local/hearthstone';
import { locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';

/** Reads card type, mechanics, and localized name for many cardIds in one query. */
export const cardMetas = os
  .route({
    method:      'GET',
    description: 'Get card type, mechanics, and localized name for many cardIds from the local database',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    cardIds: z.string().min(1).array(),
    lang:    locale.optional().default('zhs'),
  }))
  .output(z.record(z.string(), z.object({
    type:      z.string(),
    mechanics: z.record(z.string(), z.union([z.boolean(), z.number()])),
    name:      z.string().nullable(),
  })))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const ids = [...new Set(input.cardIds)];
    if (ids.length === 0) return {};

    const rows = await db.select({
      cardId:   Entity.cardId,
      type:     Entity.type,
      mechanics: Entity.mechanics,
    })
      .from(Entity)
      .where(inArray(Entity.cardId, ids));

    const byId = new Map(rows.map(row => [row.cardId, row]));

    const nameRows = await db.select({
      cardId: EntityLocalization.cardId,
      name:   EntityLocalization.name,
    })
      .from(EntityLocalization)
      .where(and(
        inArray(EntityLocalization.cardId, ids),
        eq(EntityLocalization.lang, input.lang),
      ))
      .orderBy(desc(EntityLocalization.updatedAt));

    const nameById = new Map<string, string>();
    for (const row of nameRows) {
      if (!nameById.has(row.cardId)) nameById.set(row.cardId, row.name);
    }

    const result: Record<string, { type: string, mechanics: Record<string, boolean | number>, name: string | null }> = {};
    for (const id of ids) {
      const row = byId.get(id);
      if (row) {
        result[id] = {
          type:      row.type,
          mechanics: row.mechanics as Record<string, boolean | number>,
          name:      nameById.get(id) ?? null,
        };
      }
    }
    return result;
  });
