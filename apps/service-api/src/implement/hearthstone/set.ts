import { ORPCError } from '@orpc/server';

import { eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { Set } from '@tcg-cards/db/schema/shared/hearthstone/set';

const detail = os.hearthstone.set.detail
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

export const set = { detail };
