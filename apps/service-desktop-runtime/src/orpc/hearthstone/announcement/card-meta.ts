import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';

import { Entity, EntityLocalization, LatestEntity } from '@tcg-cards/db/schema/local/hearthstone';
import { locale } from '@tcg-cards/model/hearthstone/schema/basic';
import {
  imagePremium,
  imageTemplate,
  imageZone,
} from '@tcg-cards/model/hearthstone/schema/data/image';
import { buildImageVariants, isCardImageVariantAllowed } from '@tcg-cards/shared/hearthstone/card-image-variant';
import { loadVariantMechanicIds } from '@tcg-cards/console-api/lib/hearthstone/card-image';

import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';

const ALL_VARIANTS = buildImageVariants({
  zones:     ['hand'],
  templates: ['normal', 'battlegrounds'],
  premiums:  ['normal', 'golden', 'diamond', 'signature'],
});

/** Reads the card type, mechanics, set, tech level, and allowed image variants for a cardId. */
export const cardMeta = os
  .route({
    method:      'GET',
    description: 'Get card type, mechanics, set, tech level, and allowed image variants for a cardId from the local database',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    cardId:  z.string().min(1),
    lang:    locale.optional().default('zhs'),
    version: z.number().positive().nullable().optional(),
  }))
  .output(z.object({
    type:            z.string(),
    set:             z.string(),
    techLevel:       z.number().nullable(),
    mechanics:       z.record(z.string(), z.union([z.boolean(), z.number()])),
    name:            z.string().nullable(),
    allowedVariants: z.object({
      zones:     z.array(imageZone),
      templates: z.array(imageTemplate),
      premiums:  z.array(imagePremium),
    }),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    // Without a version, use the latest build's row; otherwise the row covering
    // that build. The same cardId can change set/techLevel across builds.
    const useLatest = input.version == null;
    const source = useLatest ? LatestEntity : Entity;
    const conditions = [eq(source.cardId, input.cardId)];
    if (!useLatest) {
      conditions.push(sql`${input.version} = any(${source.version})`);
    }
    const rows = await db.select({
      type:      source.type,
      set:       source.set,
      techLevel: source.techLevel,
      mechanics: source.mechanics,
    })
      .from(source)
      .where(and(...conditions))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: `Card ${input.cardId} is not imported` });
    }

    const nameRows = await db.select({ name: EntityLocalization.name })
      .from(EntityLocalization)
      .where(and(
        eq(EntityLocalization.cardId, input.cardId),
        eq(EntityLocalization.lang, input.lang),
      ))
      .orderBy(desc(EntityLocalization.updatedAt))
      .limit(1);

    const mechanicIds = await loadVariantMechanicIds(db, ALL_VARIANTS);
    const allowed = ALL_VARIANTS.filter(variant => isCardImageVariantAllowed({
      type:      row.type,
      set:       row.set,
      techLevel: row.techLevel,
      mechanics: row.mechanics as Record<string, boolean | number>,
    }, variant, mechanicIds));

    return {
      type:            row.type,
      set:             row.set,
      techLevel:       row.techLevel,
      mechanics:       row.mechanics as Record<string, boolean | number>,
      name:            nameRows[0]?.name ?? null,
      allowedVariants: {
        zones:     [...new Set(allowed.map(variant => variant.zone))],
        templates: [...new Set(allowed.map(variant => variant.template))],
        premiums:  [...new Set(allowed.map(variant => variant.premium))],
      },
    };
  });
