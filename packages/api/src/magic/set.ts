import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@tcg-cards/db';
import { Set } from '@tcg-cards/db/schema/shared/magic/set';
import { set as setSchema } from '@tcg-cards/model/src/magic/schema/set';

export const detail = os
  .route({
    method:      'GET',
    description: 'Get a set by id',
    tags:        ['Magic', 'Set'],
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
      setId:           row.setId,
      block:           row.block ?? null,
      parent:          row.parent ?? null,
      printedSize:     row.printedSize ?? null,
      cardCount:       row.cardCount,
      langs:           row.langs,
      rarities:        row.rarities,
      localization:    [],
      type:            row.type,
      isDigital:       row.isDigital,
      isFoilOnly:      row.isFoilOnly,
      isNonfoilOnly:   row.isNonfoilOnly,
      symbolStyle:     row.symbolStyle ?? null,
      doubleFacedIcon: row.doubleFacedIcon ?? null,
      releaseDate:     row.releaseDate ?? null,
      scryfallId:      row.scryfallId,
      scryfallCode:    row.scryfallCode,
      mtgoCode:        row.mtgoCode ?? null,
      tcgPlayerId:     row.tcgPlayerId ?? null,
      boosters:        null,
    };
  });

export const setRouter = { detail };
