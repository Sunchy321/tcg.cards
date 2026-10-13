import { and, eq } from 'drizzle-orm';

import z from 'zod';

import { db } from '#db/db';
import { locale } from '#model/magic/schema/basic';
import { CardView } from '#schema/shared/magic/card';

const paramsSchema = z.object({
  cardId:    z.string(),
  locale:    locale.default('en'),
  partIndex: z.coerce.number().int().min(0).default(0),
});

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const parsed = paramsSchema.safeParse(query);

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid query parameters' });
  }

  const { cardId, locale: viewLocale, partIndex } = parsed.data;

  const view = await db.select()
    .from(CardView)
    .where(and(
      eq(CardView.cardId, cardId),
      eq(CardView.locale, viewLocale),
      eq(CardView.partIndex, partIndex),
    ))
    .then(rows => rows[0] ?? null);

  if (view == null) {
    throw createError({ statusCode: 404, statusMessage: 'Card not found' });
  }

  return view;
});
