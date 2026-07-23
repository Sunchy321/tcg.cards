import { and, eq, sql } from 'drizzle-orm';

import { locale } from '#model/hearthstone/schema/basic';
import z from 'zod';

import { db } from '#db/db';
import { CardEntityView, LatestCardEntityView } from '#schema/shared/hearthstone/entity';

const paramsSchema = z.object({
  cardId:  z.string(),
  lang:    locale.default('en'),
  version: z.coerce.number().int().min(0).optional(),
});

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const parsed = paramsSchema.safeParse(query);

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid query parameters' });
  }

  const { cardId, lang, version } = parsed.data;

  const card = version != null
    ? await db.select()
      .from(CardEntityView)
      .where(and(
        eq(CardEntityView.cardId, cardId),
        eq(CardEntityView.lang, lang),
        sql`${version} = any(${CardEntityView.version})`,
      ))
      .limit(1)
      .then(rows => rows[0] ?? null)
    : await db.select()
      .from(LatestCardEntityView)
      .where(and(
        eq(LatestCardEntityView.cardId, cardId),
        eq(LatestCardEntityView.lang, lang),
      ))
      .limit(1)
      .then(rows => rows[0] ?? null);

  if (!card) {
    throw createError({ statusCode: 404, statusMessage: 'Card not found' });
  }

  return card;
});
