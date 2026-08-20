import { ORPCError } from '@orpc/server';

import { eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { Format } from '@tcg-cards/db/schema/shared/magic/format';

const list = os.magic.format.list
  .handler(async () => {
    const formats = await db.select({ formatId: Format.formatId }).from(Format);

    return formats.map(f => f.formatId);
  });

const full = os.magic.format.full
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(Format)
      .where(eq(Format.formatId, input.formatId))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return {
      formatId:     row.formatId,
      localization: row.localization,
      sets:         row.sets,
      banlist:      row.banlist,
      birthday:     row.birthday ?? null,
      deathdate:    row.deathdate ?? null,
      tags:         row.tags,
    };
  });

export const format = { list, full };
