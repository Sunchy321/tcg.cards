import { createHash, randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { R2Bucket } from '@cloudflare/workers-types';

import { db } from '#db/db';
import type { Locale } from '#model/hearthstone/schema/basic';
import type { RenderModel } from '#model/hearthstone/schema/entity';
import {
  cardImageBrowserImportManifest,
  cardImageImportResult,
  cardImageRequirementExportInput,
  imageRequirementFile,
  type CardImageBrowserImportManifest,
  type CardImageImportProblem,
  type CardImageImportResult,
  type CardImageRequirementExportInput,
  type CardImageRequirementExportResult,
  type ImageRequirementFile,
  type ImageRequirementRequest,
  type ImageRequestRenderModel,
  type ImageStyle,
  type ImageVariant,
} from '#model/hearthstone/schema/data/image';
import { CardImageAsset, CardImageExport, CardImageImport, Entity, EntityLocalization, Set as HearthstoneSet, Tag } from '#schema/hearthstone';

export const hearthstoneImageSpecVersion = 'v1';
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

interface BrowserImportFile {
  requestId: string;
  bytes:     Uint8Array;
}

interface ExistingImageAsset {
  sha256: string | null;
  status: string;
}

interface PlannedImportFile {
  request:      ImageRequirementRequest;
  bytes:        Uint8Array;
  sha256:       string;
  byteSize:     number;
  r2Key:        string;
  shouldUpload: boolean;
}

interface CardImageImportPlan {
  acceptedFiles: PlannedImportFile[];
  missingCount:  number;
  problems:      CardImageImportProblem[];
}

interface WebpMetadata {
  width:  number;
  height: number;
}

function sha256(input: string) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function sha256Bytes(input: Uint8Array) {
  return createHash('sha256').update(input).digest('hex');
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function parseWebpMetadata(bytes: Uint8Array): WebpMetadata {
  if (bytes.byteLength < 20) {
    throw new Error('Converted payload is not a valid WebP image');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));

  if (riff !== 'RIFF' || webp !== 'WEBP') {
    throw new Error('Converted payload is not a valid WebP image');
  }

  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const chunkType = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    const nextOffset = chunkDataOffset + chunkSize + (chunkSize % 2);

    if (nextOffset > bytes.byteLength) {
      throw new Error('Converted payload is not a valid WebP image');
    }

    if (chunkType === 'VP8 ') {
      if (chunkSize < 10) {
        throw new Error('Converted payload is not a valid WebP image');
      }

      const startCodeOffset = chunkDataOffset + 3;

      if (
        bytes[startCodeOffset] !== 0x9D
        || bytes[startCodeOffset + 1] !== 0x01
        || bytes[startCodeOffset + 2] !== 0x2A
      ) {
        throw new Error('Converted payload is not a valid WebP image');
      }

      const width = view.getUint16(chunkDataOffset + 6, true) & 0x3FFF;
      const height = view.getUint16(chunkDataOffset + 8, true) & 0x3FFF;

      if (width <= 0 || height <= 0) {
        throw new Error('Converted payload is not a valid WebP image');
      }

      return { width, height };
    }

    if (chunkType === 'VP8L') {
      if (chunkSize < 5 || bytes[chunkDataOffset] !== 0x2F) {
        throw new Error('Converted payload is not a valid WebP image');
      }

      const b0 = bytes[chunkDataOffset + 1]!;
      const b1 = bytes[chunkDataOffset + 2]!;
      const b2 = bytes[chunkDataOffset + 3]!;
      const b3 = bytes[chunkDataOffset + 4]!;
      const width = 1 + (((b1 & 0x3F) << 8) | b0);
      const height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));

      if (width <= 0 || height <= 0) {
        throw new Error('Converted payload is not a valid WebP image');
      }

      return { width, height };
    }

    if (chunkType === 'VP8X') {
      if (chunkSize < 10) {
        throw new Error('Converted payload is not a valid WebP image');
      }

      const width = 1 + readUint24LE(bytes, chunkDataOffset + 4);
      const height = 1 + readUint24LE(bytes, chunkDataOffset + 7);

      if (width <= 0 || height <= 0) {
        throw new Error('Converted payload is not a valid WebP image');
      }

      return { width, height };
    }

    offset = nextOffset;
  }

  throw new Error('Converted payload is not a valid WebP image');
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

function buildImportId(now = new Date()) {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  return `hsimgimp_${stamp}_${randomUUID().slice(0, 8)}`;
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
    'card',
    hearthstoneImageSpecVersion,
    variant.zone,
    variant.template,
    variant.premium,
    renderHash.slice(0, 2),
    `${renderHash}.webp`,
  ].join('/');
}

export function validateRequirementRequest(request: ImageRequirementRequest) {
  const expectedRequestId = buildCardImageRequestId(request.card.renderHash, request.variant);
  const expectedFileName = buildCardImagePngFileName(expectedRequestId);
  const expectedR2Key = buildCardImageR2Key(request.card.renderHash, request.variant);

  if (request.requestId !== expectedRequestId) {
    throw new Error(`Request ${request.card.cardId} has mismatched requestId`);
  }

  if (request.output.fileName !== expectedFileName) {
    throw new Error(`Request ${request.card.cardId} has mismatched output.fileName`);
  }

  if (request.target.r2Key !== expectedR2Key) {
    throw new Error(`Request ${request.card.cardId} has mismatched target.r2Key`);
  }

  if (request.output.width !== request.style.width || request.output.height !== request.style.height) {
    throw new Error(`Request ${request.card.cardId} has mismatched output and style dimensions`);
  }

  if (request.output.transparentBackground !== request.style.transparentBackground) {
    throw new Error(`Request ${request.card.cardId} has mismatched transparency settings`);
  }
}

function buildExportId(now = new Date()) {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  return `hsimg_${stamp}_${randomUUID().slice(0, 8)}`;
}

function buildFileName(exportId: string) {
  return `hearthstone-card-image-requirements.${exportId}.json`;
}

function buildImportErrorMessage(missingCount: number, problems: CardImageImportProblem[]) {
  const parts = problems.slice(0, 3).map(problem => `${problem.fileName}: ${problem.message}`);

  if (missingCount > 0) {
    parts.unshift(`Missing ${missingCount} PNG file${missingCount === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join('; ');
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

export function buildCardImageImportPlan(input: {
  requirementFile: ImageRequirementFile;
  manifest:        CardImageBrowserImportManifest;
  files:           Map<string, Uint8Array>;
  existingAssets:  Map<string, ExistingImageAsset>;
}) {
  const requestById = new Map<string, ImageRequirementRequest>();
  const accountedRequestIds = new Set<string>();
  const problems: CardImageImportProblem[] = [...input.manifest.rejected];

  if (input.requirementFile.requests.length !== input.requirementFile.limits.requestCount) {
    throw new Error('Requirements JSON has mismatched request count');
  }

  for (const request of input.requirementFile.requests) {
    validateRequirementRequest(request);

    if (requestById.has(request.requestId)) {
      throw new Error(`Duplicate requestId in requirements JSON: ${request.requestId}`);
    }

    requestById.set(request.requestId, request);
  }

  const uploadByRequestId = new Map<string, {
    bytes:    Uint8Array;
    byteSize: number;
    sha256:   string;
  }>();

  for (const file of input.manifest.files) {
    accountedRequestIds.add(file.requestId);

    const request = requestById.get(file.requestId);

    if (!request) {
      problems.push({
        fileName: file.requestId,
        message:  'Converted file is not declared in the requirements JSON',
      });
      continue;
    }

    if (uploadByRequestId.has(file.requestId)) {
      problems.push({
        fileName: request.output.fileName,
        message:  'Duplicate converted file metadata',
      });
      continue;
    }

    const bytes = input.files.get(file.requestId);

    if (!bytes) {
      problems.push({
        fileName: request.output.fileName,
        message:  'Converted WebP file is missing from upload payload',
      });
      continue;
    }

    const actualSha256 = sha256Bytes(bytes);

    if (file.sha256 !== actualSha256) {
      problems.push({
        fileName: request.output.fileName,
        message:  'Converted WebP sha256 does not match uploaded bytes',
      });
      continue;
    }

    if (file.byteSize !== bytes.byteLength) {
      problems.push({
        fileName: request.output.fileName,
        message:  'Converted WebP byte size does not match uploaded bytes',
      });
      continue;
    }

    try {
      const metadata = parseWebpMetadata(bytes);

      if (metadata.width !== request.output.width || metadata.height !== request.output.height) {
        problems.push({
          fileName: request.output.fileName,
          message:  `Converted WebP dimensions ${metadata.width}x${metadata.height} do not match expected ${request.output.width}x${request.output.height}`,
        });
        continue;
      }
    } catch (error) {
      problems.push({
        fileName: request.output.fileName,
        message:  error instanceof Error ? error.message : 'Converted payload is not a valid WebP image',
      });
      continue;
    }

    uploadByRequestId.set(file.requestId, {
      bytes,
      byteSize: bytes.byteLength,
      sha256:   actualSha256,
    });
  }

  for (const requestId of input.files.keys()) {
    if (!accountedRequestIds.has(requestId)) {
      problems.push({
        fileName: requestId,
        message:  'Unexpected converted WebP payload',
      });
    }
  }

  const acceptedFiles: PlannedImportFile[] = [];

  for (const request of input.requirementFile.requests) {
    const upload = uploadByRequestId.get(request.requestId);

    if (!upload) {
      continue;
    }

    const r2Key = buildCardImageR2Key(request.card.renderHash, request.variant);
    const existing = input.existingAssets.get(r2Key);

    if (existing?.sha256 != null && existing.sha256 !== upload.sha256) {
      problems.push({
        fileName: request.output.fileName,
        message:  `Target already exists with different content: ${r2Key}`,
      });
      continue;
    }

    acceptedFiles.push({
      request,
      bytes:        upload.bytes,
      sha256:       upload.sha256,
      byteSize:     upload.byteSize,
      r2Key,
      shouldUpload: existing?.sha256 !== upload.sha256 || existing.status !== 'ready',
    });
  }

  const rejectedDeclaredFiles = new Set(problems.map(problem => problem.fileName));
  let missingCount = 0;

  for (const request of input.requirementFile.requests) {
    if (acceptedFiles.some(file => file.request.requestId === request.requestId)) {
      continue;
    }

    if (rejectedDeclaredFiles.has(request.output.fileName)) {
      continue;
    }

    missingCount += 1;
  }

  return {
    acceptedFiles,
    missingCount,
    problems,
  } satisfies CardImageImportPlan;
}

async function loadExistingImageAssets(r2Keys: string[]) {
  if (r2Keys.length === 0) {
    return new Map<string, ExistingImageAsset>();
  }

  const rows = await db.select({
    r2Key:  CardImageAsset.r2Key,
    sha256: CardImageAsset.sha256,
    status: CardImageAsset.status,
  })
    .from(CardImageAsset)
    .where(inArray(CardImageAsset.r2Key, r2Keys));

  return new Map(rows.map(row => [row.r2Key, {
    sha256: row.sha256,
    status: row.status,
  }]));
}

async function uploadAcceptedFiles(
  bucket: R2Bucket,
  files: PlannedImportFile[],
  metadata: {
    exportId: string;
    importId: string;
  },
  uploadedFiles: PlannedImportFile[],
) {
  for (const file of files) {
    if (!file.shouldUpload) {
      continue;
    }

    await bucket.put(file.r2Key, file.bytes, {
      httpMetadata: {
        contentType: 'image/webp',
      },
      customMetadata: {
        exportId:  metadata.exportId,
        importId:  metadata.importId,
        requestId: file.request.requestId,
      },
    });

    uploadedFiles.push(file);
  }
}

async function deleteUploadedFiles(
  bucket: R2Bucket,
  files: PlannedImportFile[],
) {
  for (const file of files) {
    await bucket.delete(file.r2Key);
  }
}

export async function importCardImageArchiveFromBrowser(input: {
  requirementContent: string;
  manifest:           unknown;
  files:              BrowserImportFile[];
  env:                {
    R2_ASSET?:        R2Bucket | undefined;
    R2_ASSET_BUCKET?: string | undefined;
  };
}) {
  const requirementFile = imageRequirementFile.parse(JSON.parse(input.requirementContent));
  const manifest = cardImageBrowserImportManifest.parse(input.manifest);
  const bucket = input.env.R2_ASSET;

  if (!bucket) {
    throw new Error('R2_ASSET bucket is not configured');
  }

  const fileMap = new Map<string, Uint8Array>();

  for (const file of input.files) {
    if (fileMap.has(file.requestId)) {
      throw new Error(`Duplicate uploaded WebP file: ${file.requestId}`);
    }

    fileMap.set(file.requestId, file.bytes);
  }

  const existingAssets = await loadExistingImageAssets(
    requirementFile.requests.map(request => buildCardImageR2Key(request.card.renderHash, request.variant)),
  );

  const plan = buildCardImageImportPlan({
    requirementFile,
    manifest,
    files: fileMap,
    existingAssets,
  });

  const importId = buildImportId();
  const importedCount = plan.acceptedFiles.length;
  const uploadedCount = plan.acceptedFiles.filter(file => file.shouldUpload).length;
  const reusedCount = importedCount - uploadedCount;
  const rejectedCount = plan.problems.length;
  const status = rejectedCount === 0 && plan.missingCount === 0
    ? 'completed'
    : importedCount > 0 || plan.missingCount > 0
      ? 'partial'
      : 'failed';
  const errorMessage = buildImportErrorMessage(plan.missingCount, plan.problems);
  const now = new Date();
  const r2Bucket = input.env.R2_ASSET_BUCKET ?? defaultR2AssetBucket;

  const uploadedFiles: PlannedImportFile[] = [];

  try {
    await uploadAcceptedFiles(bucket, plan.acceptedFiles, {
      exportId: requirementFile.exportId,
      importId,
    }, uploadedFiles);

    await db.transaction(async tx => {
      await tx.insert(CardImageImport).values({
        importId,
        exportId:         requirementFile.exportId,
        imageSpecVersion: requirementFile.imageSpecVersion,
        archiveFileName:  manifest.archiveFileName,
        archiveSha256:    null,
        expectedCount:    requirementFile.requests.length,
        importedCount,
        uploadedCount,
        reusedCount,
        missingCount:     plan.missingCount,
        rejectedCount,
        status,
        errorMessage,
      });

      for (const file of plan.acceptedFiles) {
        await tx.insert(CardImageAsset)
          .values({
            imageSpecVersion: requirementFile.imageSpecVersion,
            renderHash:       file.request.card.renderHash,
            lang:             file.request.card.lang,
            zone:             file.request.variant.zone,
            template:         file.request.variant.template,
            premium:          file.request.variant.premium,
            r2Bucket,
            r2Key:            file.r2Key,
            contentType:      'image/webp',
            byteSize:         file.byteSize,
            width:            file.request.output.width,
            height:           file.request.output.height,
            sha256:           file.sha256,
            sourceExportId:   requirementFile.exportId,
            sourceImportId:   importId,
            status:           'ready',
            errorMessage:     null,
            verifiedAt:       now,
          })
          .onConflictDoUpdate({
            target: [CardImageAsset.imageSpecVersion, CardImageAsset.renderHash, CardImageAsset.zone, CardImageAsset.template, CardImageAsset.premium],
            set:    {
              lang:           file.request.card.lang,
              r2Bucket,
              r2Key:          file.r2Key,
              contentType:    'image/webp',
              byteSize:       file.byteSize,
              width:          file.request.output.width,
              height:         file.request.output.height,
              sha256:         file.sha256,
              sourceExportId: requirementFile.exportId,
              sourceImportId: importId,
              status:         'ready',
              errorMessage:   null,
              verifiedAt:     now,
            },
          });
      }
    });
  } catch (error) {
    try {
      await deleteUploadedFiles(bucket, uploadedFiles);
    } catch {
      // no-op
    }

    throw error;
  }

  return cardImageImportResult.parse({
    importId,
    exportId:         requirementFile.exportId,
    imageSpecVersion: requirementFile.imageSpecVersion,
    archiveFileName:  manifest.archiveFileName,
    expectedCount:    requirementFile.requests.length,
    importedCount,
    uploadedCount,
    reusedCount,
    missingCount:     plan.missingCount,
    rejectedCount,
    status,
    errorMessage,
    problems:         plan.problems,
  } satisfies CardImageImportResult);
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
