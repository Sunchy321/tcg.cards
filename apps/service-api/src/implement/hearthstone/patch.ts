import { ORPCError } from '@orpc/server';

import { eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { Patch } from '@tcg-cards/db/schema/shared/hearthstone/patch';

const detail = os.hearthstone.patch.detail
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(Patch)
      .where(eq(Patch.buildNumber, input.buildNumber))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return row;
  });

export const patch = { detail };
