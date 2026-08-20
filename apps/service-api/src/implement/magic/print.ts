import { ORPCError } from '@orpc/server';

import { and, eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { PrintView } from '@tcg-cards/db/schema/shared/magic/print';

const basic = os.magic.print.basic
  .handler(async ({ input }) => {
    const view = await db.select()
      .from(PrintView)
      .where(and(
        eq(PrintView.cardId, input.cardId),
        eq(PrintView.set, input.set),
        eq(PrintView.number, input.number),
        eq(PrintView.lang, input.lang),
        eq(PrintView.partIndex, input.partIndex),
      ))
      .then(rows => rows[0]);

    if (view == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return view;
  });

export const print = { basic };
