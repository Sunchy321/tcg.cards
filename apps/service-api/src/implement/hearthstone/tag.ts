import { ORPCError } from '@orpc/server';

import { eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { Tag } from '@tcg-cards/db/schema/shared/hearthstone/tag';
import { getDefaultTagCopy, getTagProjectTargetType } from '@tcg-cards/model/hearthstone/schema/tag';

const detail = os.hearthstone.tag.detail
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(Tag)
      .where(eq(Tag.enumId, input.enumId))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return {
      ...row,
      ...getDefaultTagCopy(row.localization, row.rawName),
      projectTargetType: getTagProjectTargetType(row.projectKind),
    };
  });

export const tag = { detail };
