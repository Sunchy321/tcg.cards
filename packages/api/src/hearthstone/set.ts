import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@tcg-cards/db';
import { Set } from '@tcg-cards/db/schema/shared/hearthstone/set';
import { set as setSchema } from '@tcg-cards/model/src/hearthstone/schema/set';

export const detail = os
  .route({
    method:      'GET',
    description: 'Get a set by id',
    tags:        ['Hearthstone', 'Set'],
  })
  .input(z.object({ setId: z.string() }))
  .output(setSchema)
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(Set)
      .where(eq(Set.setId, input.setId))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return {
      setId:         row.setId,
      dbfId:         row.dbfId ?? null,
      slug:          row.slug ?? null,
      rawName:       row.rawName ?? null,
      localization:  [],
      type:          row.type,
      releaseDate:   row.releaseDate,
      cardCountFull: row.cardCountFull ?? null,
      cardCount:     row.cardCount ?? null,
      group:         row.group ?? null,
      year:          row.year ?? null,
    };
  });

export const setRouter = { detail };
