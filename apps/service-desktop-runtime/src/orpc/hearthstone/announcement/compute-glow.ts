import { and, eq, sql } from 'drizzle-orm';
import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';

import { Entity, EntityLocalization } from '@tcg-cards/db/schema/local/hearthstone';
import { glowEntry } from '@tcg-cards/model/hearthstone/schema/announcement';
import { locale, type Locale } from '@tcg-cards/model/hearthstone/schema/basic';
import type { RenderModel } from '@tcg-cards/model/hearthstone/schema/entity';

import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';
import { computeGlowDiff } from '../../../lib/hearthstone/announcement/glow-calc';

/** Resolves the render model of one card at a specific build number. */
async function resolveSideModel(cardId: string, build: number, lang: Locale): Promise<RenderModel | null> {
  const db = getLocalDb();
  const [row] = await db.select({
    renderModel: EntityLocalization.renderModel,
  })
    .from(Entity)
    .innerJoin(EntityLocalization, and(
      eq(Entity.cardId, EntityLocalization.cardId),
      eq(Entity.revisionHash, EntityLocalization.revisionHash),
      sql`${Entity.version} && ${EntityLocalization.version}`,
      sql`${build} = ANY(${EntityLocalization.version})`,
    ))
    .where(and(
      eq(Entity.cardId, cardId),
      eq(EntityLocalization.lang, lang),
      sql`${build} = ANY(${Entity.version})`,
    ))
    .limit(1);
  return row?.renderModel ? (row.renderModel as RenderModel) : null;
}

/** Computes the glow (highlight) entries between two card versions for an announcement item. */
export const computeCardGlow = os
  .route({
    method:      'GET',
    description: 'Compute glow (highlight) entries by diffing two card versions',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    cardId:      z.string().min(1),
    version:     z.number().int().positive(),
    lastVersion: z.number().int().positive(),
    lang:        locale.default('zhs'),
    delta:       z.object({
      prev: z.record(z.string(), z.unknown()).optional(),
      curr: z.record(z.string(), z.unknown()).optional(),
    }).optional(),
  }))
  .output(z.array(glowEntry))
  .handler(async ({ input }) => {
    const [currModel, prevModel] = await Promise.all([
      resolveSideModel(input.cardId, input.version, input.lang),
      resolveSideModel(input.cardId, input.lastVersion, input.lang),
    ]);

    if (!currModel) {
      throw new ORPCError('NOT_FOUND', { message: `cardId ${input.cardId} 在版本 ${input.version} 查不到数据` });
    }
    if (!prevModel) {
      throw new ORPCError('NOT_FOUND', { message: `cardId ${input.cardId} 在版本 ${input.lastVersion} 查不到数据` });
    }

    const curr = input.delta?.curr ? { ...currModel, ...input.delta.curr } : currModel;
    const prev = input.delta?.prev ? { ...prevModel, ...input.delta.prev } : prevModel;

    return computeGlowDiff(curr as RenderModel, prev as RenderModel);
  });
