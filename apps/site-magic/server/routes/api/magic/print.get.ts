import { and, eq } from 'drizzle-orm';

import z from 'zod';

import { db } from '#db/db';
import { locale } from '#model/magic/schema/basic';
import { PrintView } from '#schema/shared/magic/print';

const paramsSchema = z.object({
  cardId:    z.string(),
  set:       z.string(),
  number:    z.string(),
  lang:      locale.default('en'),
  partIndex: z.coerce.number().int().min(0),
});

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const parsed = paramsSchema.safeParse(query);

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid query parameters' });
  }

  const { cardId, set, number, lang, partIndex } = parsed.data;

  const view = await db.select()
    .from(PrintView)
    .where(and(
      eq(PrintView.cardId, cardId),
      eq(PrintView.set, set),
      eq(PrintView.number, number),
      eq(PrintView.lang, lang),
      eq(PrintView.partIndex, partIndex),
    ))
    .then(rows => rows[0] ?? null);

  if (view == null) {
    throw createError({ statusCode: 404, statusMessage: 'Print not found' });
  }

  return view;
});
