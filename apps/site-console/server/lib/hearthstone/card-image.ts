import { createHash, randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '#db/db';
import type { Locale } from '#model/hearthstone/schema/basic';
import type { RenderModel } from '#model/hearthstone/schema/entity';
import {
  cardImageRequirementExportInput,
  imageRequirementFile,
  type CardImageRequirementExportInput,
  type CardImageRequirementExportResult,
  type ImageRequirementRequest,
  type ImageRequestRenderModel,
  type ImageStyle,
  type ImageVariant,
} from '#model/hearthstone/schema/data/image';
import { CardImageAsset, CardImageExport, Entity, EntityLocalization, Set as HearthstoneSet, Tag } from '#schema/hearthstone';

export const hearthstoneImageSpecVersion = 'hs-card-image-v1';
export const hearthstoneImageRequirementSchema = 'tcg.cards.hearthstone.card-image-requirements.v1';
export const defaultCardImageExportLimit = 200;
export const hardCardImageExportLimit = 500;

const exportBatchSize = 1000;
const defaultR2AssetBucket = 'asset';
const diamondMechanicSlug = 'has_diamond';
const signatureMechanicSlug = 'has_signature';

type MechanicValue = boolean | number;
type MechanicMap = Record<string, MechanicValue>;

export interface ImageCandidateRow {
  cardId:           string;
  version:          number[];
  lang:             Locale;
  revisionHash:     string;
  localizationHash: string;
  renderHash:       string;
  renderModel:      RenderModel;
  type:             RenderModel['type'];
  set:              string;
  setDbfId:         number;
  techLevel:        number | null;
  mechanics:        MechanicMap;
}

export interface ImageVariantMechanicIds {
  diamond:   string | null;
  signature: string | null;
}

function sha256(input: string) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function latestOrVersion(
  versionColumn: typeof Entity.version | typeof EntityLocalization.version,
  latestColumn: typeof Entity.isLatest | typeof EntityLocalization.isLatest,
  version: number | undefined,
) {
  return version == null
    ? eq(latestColumn, true)
    : sql`${version} = any(${versionColumn})`;
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | null | undefined) {
  if (cursor == null || cursor.length === 0) {
    return 0;
  }

  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const payload = JSON.parse(raw) as { offset?: unknown };
    const offset = payload.offset;

    if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('Invalid export cursor');
    }

    return offset;
  } catch {
    throw new Error('Invalid export cursor');
  }
}

function imageKey(renderHash: string, variant: ImageVariant) {
  return `${renderHash}\u0000${variant.zone}\u0000${variant.template}\u0000${variant.premium}`;
}

function isMechanicEnabled(value: unknown) {
  return value === true || (typeof value === 'number' && value !== 0);
}

function hasMechanic(mechanics: MechanicMap, slug: string, enumId: string | null) {
  if (isMechanicEnabled(mechanics[slug])) {
    return true;
  }

  return enumId != null && isMechanicEnabled(mechanics[enumId]);
}

export function buildImageVariants(input: Pick<CardImageRequirementExportInput, 'zones' | 'templates' | 'premiums'>) {
  const zones = uniqueValues(input.zones);
  const templates = uniqueValues(input.templates);
  const premiums = uniqueValues(input.premiums);

  return zones.flatMap(zone =>
    templates.flatMap(template =>
      premiums.map(premium => ({
        zone,
        template,
        premium,
      }))),
  );
}

export function buildCardImageStyle(variant: ImageVariant): ImageStyle {
  return {
    styleKey:              `${variant.zone}.${variant.template}.${variant.premium}`,
    zone:                  variant.zone,
    template:              variant.template,
    premium:               variant.premium,
    layout:                variant.zone === 'play' ? 'card.play.v1' : 'card.hand.v1',
    width:                 512,
    height:                768,
    transparentBackground: true,
  };
}

export function isCardImageVariantAllowed(
  row: Pick<ImageCandidateRow, 'type' | 'set' | 'techLevel' | 'mechanics'>,
  variant: ImageVariant,
  mechanicIds: ImageVariantMechanicIds,
) {
  if (row.type === 'enchantment') {
    return false;
  }

  if (variant.zone === 'play') {
    return false;
  }

  if (variant.template === 'battlegrounds') {
    return variant.zone === 'hand'
      && variant.premium === 'normal'
      && (row.set === 'bgs' || row.techLevel != null);
  }

  if (variant.zone !== 'hand' || variant.template !== 'normal') {
    return false;
  }

  if (variant.premium === 'normal' || variant.premium === 'golden') {
    return true;
  }

  if (variant.premium === 'diamond') {
    return hasMechanic(row.mechanics, diamondMechanicSlug, mechanicIds.diamond);
  }

  if (variant.premium === 'signature') {
    return hasMechanic(row.mechanics, signatureMechanicSlug, mechanicIds.signature);
  }

  return false;
}

export function buildCardImageRequestId(renderHash: string, variant: ImageVariant) {
  const digest = sha256([
    hearthstoneImageSpecVersion,
    renderHash,
    variant.zone,
    variant.template,
    variant.premium,
  ].join('\n'));

  return `sha256:${digest}`;
}

export function buildCardImagePngFileName(requestId: string) {
  return `${requestId.replace(/^sha256:/, '')}.png`;
}

export function buildCardImageR2Key(renderHash: string, variant: ImageVariant) {
  return [
    'hearthstone',
    'card-images',
    hearthstoneImageSpecVersion,
    variant.zone,
    variant.template,
    variant.premium,
    renderHash.slice(0, 2),
    `${renderHash}.webp`,
  ].join('/');
}

function buildExportId(now = new Date()) {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  return `hsimg_${stamp}_${randomUUID().slice(0, 8)}`;
}

function buildFileName(exportId: string) {
  return `hearthstone-card-image-requirements.${exportId}.json`;
}

function buildImageRequestRenderModel(
  model: RenderModel,
  setDbfId: number,
): ImageRequestRenderModel {
  return {
    ...model,
    set: setDbfId,
  };
}

function buildRequest(
  row: ImageCandidateRow,
  variant: ImageVariant,
  r2Bucket: string,
): ImageRequirementRequest {
  const style = buildCardImageStyle(variant);
  const requestId = buildCardImageRequestId(row.renderHash, variant);

  return {
    requestId,
    card: {
      cardId:           row.cardId,
      lang:             row.lang as ImageRequirementRequest['card']['lang'],
      version:          row.version,
      revisionHash:     row.revisionHash,
      localizationHash: row.localizationHash,
      renderHash:       row.renderHash,
    },
    variant,
    style,
    output: {
      fileName:              buildCardImagePngFileName(requestId),
      format:                'png',
      width:                 style.width,
      height:                style.height,
      transparentBackground: style.transparentBackground,
    },
    target: {
      r2Bucket,
      r2Key:       buildCardImageR2Key(row.renderHash, variant),
      contentType: 'image/webp',
    },
    renderModel: buildImageRequestRenderModel(row.renderModel, row.setDbfId),
  };
}

export function collectImageRequirementRequests(input: {
  rows:        ImageCandidateRow[];
  readyKeys:   Set<string>;
  variants:    ImageVariant[];
  mechanicIds: ImageVariantMechanicIds;
  r2Bucket:    string;
  offset:      number;
  limit:       number;
  seenMissing: number;
}) {
  const requests: ImageRequirementRequest[] = [];
  let missingCount = 0;

  for (const row of input.rows) {
    for (const variant of input.variants) {
      if (!isCardImageVariantAllowed(row, variant, input.mechanicIds)) {
        continue;
      }

      if (input.readyKeys.has(imageKey(row.renderHash, variant))) {
        continue;
      }

      const currentIndex = input.seenMissing + missingCount;

      if (currentIndex >= input.offset && requests.length < input.limit) {
        requests.push(buildRequest(row, variant, input.r2Bucket));
      }

      missingCount += 1;
    }
  }

  return {
    requests,
    missingCount,
  };
}

async function loadVariantMechanicIds(variants: ImageVariant[]): Promise<ImageVariantMechanicIds> {
  const slugs = uniqueValues(variants.flatMap(variant => {
    if (variant.premium === 'diamond') {
      return [diamondMechanicSlug];
    }

    if (variant.premium === 'signature') {
      return [signatureMechanicSlug];
    }

    return [];
  }));

  if (slugs.length === 0) {
    return {
      diamond:   null,
      signature: null,
    };
  }

  const rows = await db.select({
    enumId: Tag.enumId,
    slug:   Tag.slug,
  })
    .from(Tag)
    .where(inArray(Tag.slug, slugs));

  return {
    diamond:   String(rows.find(row => row.slug === diamondMechanicSlug)?.enumId ?? '') || null,
    signature: String(rows.find(row => row.slug === signatureMechanicSlug)?.enumId ?? '') || null,
  };
}

async function loadCandidateRows(
  input: CardImageRequirementExportInput,
  rowOffset: number,
  rowLimit: number,
) {
  const filters = [
    eq(EntityLocalization.lang, input.lang),
    latestOrVersion(Entity.version, Entity.isLatest, input.version),
    latestOrVersion(EntityLocalization.version, EntityLocalization.isLatest, input.version),
    sql<boolean>`${EntityLocalization.renderHash} is not null`,
    sql<boolean>`${EntityLocalization.renderModel} is not null`,
    sql<boolean>`${Entity.type} <> 'enchantment'`,
  ];

  if (input.cardId) {
    filters.push(eq(Entity.cardId, input.cardId));
  }

  return await db.select({
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
    .innerJoin(HearthstoneSet, eq(Entity.set, HearthstoneSet.setId))
    .where(and(...filters))
    .orderBy(
      asc(Entity.cardId),
      asc(EntityLocalization.localizationHash),
    )
    .limit(rowLimit)
    .offset(rowOffset)
    .then(rows => rows.flatMap(row => {
      if (row.renderHash == null || row.renderModel == null) {
        return [];
      }

      if (row.setDbfId == null) {
        throw new Error(`Missing set dbf_id for card ${row.cardId} set ${row.set}`);
      }

      return [{
        ...row,
        renderHash:  row.renderHash,
        renderModel: row.renderModel,
        setDbfId:    row.setDbfId,
      }];
    }));
}

async function loadReadyKeys(renderHashes: string[], variants: ImageVariant[]) {
  if (renderHashes.length === 0 || variants.length === 0) {
    return new Set<string>();
  }

  const zones = uniqueValues(variants.map(variant => variant.zone));
  const templates = uniqueValues(variants.map(variant => variant.template));
  const premiums = uniqueValues(variants.map(variant => variant.premium));

  const rows = await db.select({
    renderHash: CardImageAsset.renderHash,
    zone:       CardImageAsset.zone,
    template:   CardImageAsset.template,
    premium:    CardImageAsset.premium,
  })
    .from(CardImageAsset)
    .where(and(
      eq(CardImageAsset.imageSpecVersion, hearthstoneImageSpecVersion),
      eq(CardImageAsset.status, 'ready'),
      inArray(CardImageAsset.renderHash, renderHashes),
      inArray(CardImageAsset.zone, zones),
      inArray(CardImageAsset.template, templates),
      inArray(CardImageAsset.premium, premiums),
    ));

  return new Set(rows.map(row => (
    `${row.renderHash}\u0000${row.zone}\u0000${row.template}\u0000${row.premium}`
  )));
}

export async function exportCardImageRequirements(
  rawInput: CardImageRequirementExportInput,
  options?: {
    r2Bucket?: string | undefined;
  },
): Promise<CardImageRequirementExportResult> {
  const input = cardImageRequirementExportInput.parse(rawInput);
  const variants = buildImageVariants(input);
  const mechanicIds = await loadVariantMechanicIds(variants);
  const offset = decodeCursor(input.cursor);
  const r2Bucket = options?.r2Bucket ?? defaultR2AssetBucket;

  let rowOffset = 0;
  let seenMissing = 0;
  const requests: ImageRequirementRequest[] = [];

  while (true) {
    const rows = await loadCandidateRows(input, rowOffset, exportBatchSize);

    if (rows.length === 0) {
      break;
    }

    rowOffset += rows.length;

    const readyKeys = await loadReadyKeys(
      uniqueValues(rows.map(row => row.renderHash)),
      variants,
    );

    const result = collectImageRequirementRequests({
      rows,
      readyKeys,
      variants,
      mechanicIds,
      r2Bucket,
      offset,
      limit: input.limit - requests.length,
      seenMissing,
    });

    seenMissing += result.missingCount;
    requests.push(...result.requests);
  }

  if (requests.length === 0) {
    throw new Error('No missing card images matched filters');
  }

  const exportId = buildExportId();
  const fileName = buildFileName(exportId);
  const nextOffset = offset + requests.length;
  const hasMore = nextOffset < seenMissing;
  const nextCursor = hasMore ? encodeCursor(nextOffset) : null;

  const requirementFile = imageRequirementFile.parse({
    schema:           hearthstoneImageRequirementSchema,
    exportId,
    imageSpecVersion: hearthstoneImageSpecVersion,
    generatedAt:      new Date().toISOString(),
    toolContract:     {
      inputFormat:         'json',
      outputArchiveFormat: 'zip',
      outputImageFormat:   'png',
      fileNamePolicy:      'exact',
    },
    limits: {
      defaultMaxRequests: defaultCardImageExportLimit,
      hardMaxRequests:    hardCardImageExportLimit,
      maxRequests:        input.limit,
      requestCount:       requests.length,
      remainingEstimate:  Math.max(0, seenMissing - nextOffset),
    },
    batch: {
      index:  Math.floor(offset / input.limit) + 1,
      cursor: nextCursor,
      hasMore,
    },
    defaults: {
      png: {
        color:                 'rgba',
        transparentBackground: true,
      },
      target: {
        contentType: 'image/webp',
        webpPreset:  'q86-m4-fast',
      },
    },
    requests,
  });

  const content = JSON.stringify(requirementFile, null, 2);

  await db.insert(CardImageExport).values({
    exportId,
    imageSpecVersion: hearthstoneImageSpecVersion,
    filters:          {
      lang:      input.lang,
      cardId:    input.cardId ?? null,
      version:   input.version ?? null,
      zones:     input.zones,
      templates: input.templates,
      premiums:  input.premiums,
      limit:     input.limit,
      cursor:    input.cursor ?? null,
    },
    requestCount:    requests.length,
    maxRequestCount: input.limit,
    fileFormat:      'json',
    fileName,
    fileSha256:      sha256(content),
  });

  return {
    exportId,
    fileName,
    requestCount:      requests.length,
    remainingEstimate: Math.max(0, seenMissing - nextOffset),
    hasMore,
    nextCursor,
    content,
  };
}
