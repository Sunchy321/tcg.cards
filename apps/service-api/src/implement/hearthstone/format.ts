import { ORPCError } from '@orpc/server';

import { eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { Format } from '@tcg-cards/db/schema/shared/hearthstone/format';

const detail = os.hearthstone.format.detail
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(Format)
      .where(eq(Format.formatId, input.formatId))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return row;
  });

export const format = { detail };
