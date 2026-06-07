import { and, asc, eq, sql } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { Entity, EntityLocalization } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { Set as HearthstoneSet } from '@tcg-cards/db/schema/shared/hearthstone/set';
import type { ImageVariant } from '@tcg-cards/model/src/hearthstone/schema/data/image';
import {
  buildImageVariants,
  buildRequest,
  isCardImageVariantAllowed,
  loadVariantMechanicIds,
  type ImageCandidateRow,
  type ImageVariantMechanicIds,
} from '@tcg-cards/console-api/lib/hearthstone/card-image';

type ImageDebugDb = ReturnType<typeof createDb>;

const defaultR2AssetBucket = 'asset';

export interface DebugRenderRequestOptions {
  lang?: string | undefined;
  zones?: string[] | undefined;
  templates?: string[] | undefined;
  premiums?: string[] | undefined;
  r2Bucket?: string | undefined;
}

/** Builds render requests for a given renderHash, one per applicable variant. */
export async function buildDebugRenderRequests(
  db: ImageDebugDb,
  renderHash: string,
  options?: DebugRenderRequestOptions,
) {
  const lang = options?.lang ?? 'zhs';
  const zones = options?.zones ?? ['hand'];
  const templates = options?.templates ?? ['normal'];
  const premiums = options?.premiums ?? ['normal'];
  const r2Bucket = options?.r2Bucket ?? defaultR2AssetBucket;

  const rows = await db.select({
    cardId:           Entity.cardId,
    version:          sql<number[]>`${Entity.version} & ${EntityLocalization.version}`.as('version'),
    lang:             EntityLocalization.lang,
    revisionHash:     Entity.revisionHash,
    localizationHash: EntityLocalization.localizationHash,
    renderHash:       EntityLocalization.renderHash,
    renderModel:      EntityLocalization.renderModel,
    type:             Entity.type,
    set:              Entity.set,
    setDbfId:         HearthstoneSet.dbfId,
    techLevel:        Entity.techLevel,
    mechanics:        Entity.mechanics,
  })
    .from(Entity)
    .innerJoin(EntityLocalization, and(
      eq(Entity.cardId, EntityLocalization.cardId),
      eq(Entity.revisionHash, EntityLocalization.revisionHash),
      sql`${Entity.version} && ${EntityLocalization.version}`,
    ))
    .leftJoin(HearthstoneSet, eq(Entity.set, HearthstoneSet.setId))
    .where(and(
      eq(EntityLocalization.renderHash, renderHash),
      eq(EntityLocalization.lang, lang),
    ))
    .orderBy(asc(EntityLocalization.localizationHash))
    .limit(1);

  const row = rows[0];

  if (!row || row.renderHash == null || row.renderModel == null) {
    throw new Error(`No card found with renderHash ${renderHash} and lang ${lang}`);
  }

  const candidate: ImageCandidateRow = {
    cardId:           row.cardId,
    version:          row.version,
    lang:             row.lang,
    revisionHash:     row.revisionHash,
    localizationHash: row.localizationHash,
    renderHash:       row.renderHash,
    renderModel:      row.renderModel,
    type:             row.type,
    set:              row.set,
    setDbfId:         row.setDbfId ?? 0,
    techLevel:        row.techLevel,
    mechanics:        row.mechanics as ImageCandidateRow['mechanics'],
  };

  const variants = buildImageVariants({ zones, templates, premiums });
  const mechanicIds = await loadVariantMechanicIds(db, variants);

  const requests = [];

  for (const variant of variants) {
    if (!isCardImageVariantAllowed(candidate, variant, mechanicIds)) {
      continue;
    }

    requests.push(buildRequest(candidate, variant, r2Bucket));
  }

  return {
    cardId:      candidate.cardId,
    lang:        candidate.lang,
    renderHash:  candidate.renderHash,
    variantCount: requests.length,
    requests,
  };
}
