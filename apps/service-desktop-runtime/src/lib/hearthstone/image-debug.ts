import { and, asc, eq, sql } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { Entity, EntityLocalization } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { Set as HearthstoneSet } from '@tcg-cards/db/schema/shared/hearthstone/set';
import type { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';
import type { ImagePremium, ImageTemplate, ImageVariant, ImageZone } from '@tcg-cards/model/src/hearthstone/schema/data/image';
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

/** Recursively strips null values from a JSON object so Zod optional() validation passes. */
function stripNulls<T>(value: T): T {
  if (value === null || value === undefined) return undefined as unknown as T;
  if (Array.isArray(value)) return value.map(stripNulls) as unknown as T;
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null) {
        result[k] = stripNulls(v);
      }
    }
    return result as unknown as T;
  }
  return value;
}

export interface DebugRenderRequestOptions {
  lang?: Locale;
  zones?: ImageZone[];
  templates?: ImageTemplate[];
  premiums?: ImagePremium[];
  r2Bucket?: string;
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
    renderModel:      stripNulls(row.renderModel),
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
    cardId:          candidate.cardId,
    lang:            candidate.lang,
    renderHash:      candidate.renderHash,
    set:             candidate.set,
    type:            candidate.type,
    techLevel:       candidate.techLevel,
    variantCount:    requests.length,
    requests,
  };
}

/** Builds render requests for a given cardId, one per applicable variant. */
export async function buildCardIdRenderRequests(
  db: ImageDebugDb,
  cardId: string,
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
      eq(Entity.cardId, cardId),
      eq(EntityLocalization.lang, lang),
    ))
    .orderBy(asc(EntityLocalization.localizationHash))
    .limit(1);

  const row = rows[0];

  if (!row || row.renderHash == null || row.renderModel == null) {
    throw new Error(`No card found with cardId ${cardId} and lang ${lang}`);
  }

  const candidate: ImageCandidateRow = {
    cardId:           row.cardId,
    version:          row.version,
    lang:             row.lang,
    revisionHash:     row.revisionHash,
    localizationHash: row.localizationHash,
    renderHash:       row.renderHash,
    renderModel:      stripNulls(row.renderModel),
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
    cardId:          candidate.cardId,
    lang:            candidate.lang,
    renderHash:      candidate.renderHash,
    set:             candidate.set,
    type:            candidate.type,
    techLevel:       candidate.techLevel,
    variantCount:    requests.length,
    requests,
  };
}
