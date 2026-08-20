import { ORPCError } from '@orpc/server';

import { eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { Set } from '@tcg-cards/db/schema/shared/magic/set';

const detail = os.magic.set.detail
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

export const set = { detail };
