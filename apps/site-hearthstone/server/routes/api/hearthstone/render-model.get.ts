import { and, eq, sql } from 'drizzle-orm';

import { locale } from '#model/hearthstone/schema/basic';
import z from 'zod';

import { db } from '#db/db';
import { EntityLocalization } from '#schema/shared/hearthstone/entity';

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
  const versionFilter = version == null
    ? eq(EntityLocalization.isLatest, true)
    : sql`${version} = any(${EntityLocalization.version})`;

  const row = await db.select({
    cardId:           EntityLocalization.cardId,
    lang:             EntityLocalization.lang,
    revisionHash:     EntityLocalization.revisionHash,
    localizationHash: EntityLocalization.localizationHash,
    renderHash:       EntityLocalization.renderHash,
    renderModel:      EntityLocalization.renderModel,
    version:          EntityLocalization.version,
    isLatest:         EntityLocalization.isLatest,
  })
    .from(EntityLocalization)
    .where(and(
      eq(EntityLocalization.cardId, cardId),
      eq(EntityLocalization.lang, lang),
      versionFilter,
    ))
    .limit(1)
    .then(rows => rows[0] ?? null);

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Render model not found' });
  }

  return row;
});
