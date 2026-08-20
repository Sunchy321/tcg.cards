import { ORPCError } from '@orpc/server';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { BaseEntityLocalization, CardEntityView } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { BaseCard } from '@tcg-cards/db/schema/remote/hearthstone/index';

const maxVersion = (version: typeof CardEntityView.version) => sql<number>`
  (
    SELECT max(value)
    FROM unnest(${version}) AS version_item(value)
  )
`;

const latestOrVersion = (
  versionColumn: typeof CardEntityView.version,
  version: number | undefined,
) => version == null ? undefined : sql`${version} = any(${versionColumn})`;

const summary = os.hearthstone.card.summary
  .handler(async ({ input }) => {
    const filters = [
      eq(CardEntityView.cardId, input.cardId),
      eq(CardEntityView.lang, input.lang),
    ];
    const versionFilter = latestOrVersion(CardEntityView.version, input.version);
    if (versionFilter != null) {
      filters.push(versionFilter);
    }

    const card = await db.select().from(CardEntityView)
      .where(and(...filters))
      .orderBy(desc(maxVersion(CardEntityView.version)))
      .limit(1)
      .then(rows => rows[0]);

    if (card == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return card;
  });

const random = os.hearthstone.card.random
  .handler(async () => {
    const rows = await db.select({ cardId: BaseCard.cardId }).from(BaseCard);

    const pick = rows[Math.floor(Math.random() * rows.length)];

    if (pick == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return pick.cardId;
  });

const named = os.hearthstone.card.named
  .handler(async ({ input }) => {
    const row = await db.select({ cardId: BaseEntityLocalization.cardId })
      .from(BaseEntityLocalization)
      .where(and(
        eq(BaseEntityLocalization.name, input.name),
        eq(BaseEntityLocalization.lang, input.lang),
        isNull(BaseEntityLocalization.deletedAt),
      ))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return row.cardId;
  });

export const card = { summary, random, named };
