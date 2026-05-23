import { createHash } from 'node:crypto';

import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import {
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  Set as HearthstoneSet,
  SourceVersion,
  Tag,
} from '@tcg-cards/db/schema/local/hearthstone';

import {
  buildHsdataPlaceholderSetId,
  isHsdataPlaceholderSetId,
} from './hsdata-set-placeholder';
import { createHsdataProfiler } from './hsdata-profile';

// Shared transaction shape for import helpers.
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Generic JSON payload fragments stored during import.
export type JsonMap = Record<string, unknown>;

// Normalized tag value shapes used by raw tag storage.
type TagValueKind
  = | 'bool'
    | 'card_ref'
    | 'int'
    | 'json'
    | 'loc_string'
    | 'string';

// Normalized raw tag before database projection.
export interface RawTagInput {
  enumId:         number;
  rawName:        string;
  rawType:        string;
  rawPayload:     JsonMap;
  rawValue:       string | null;
  locStringValue: Record<string, string> | null;
  cardRefCardId:  string | null;
  tagOrder:       number;
}

// Snapshot content used to derive one parsed entity and snapshot hash.
export interface HsdataSnapshotInput {
  cardId:           string;
  dbfId:            number;
  entityXmlVersion: number;
  tags:             RawTagInput[];
  extraPayload: JsonMap;
}

// Parsed hsdata entity snapshot.
export interface ParsedEntity {
  cardId:           string;
  dbfId:            number;
  entityXmlVersion: number;
  tags:             RawTagInput[];
  extraPayload:     JsonMap;
  snapshotHash:     string;
}

// Parsed hsdata source payload.
export interface ParsedHsdata {
  build:    number;
  entities: ParsedEntity[];
}

// Discovered-tag data already stored in the database.
interface ExistingTagRow {
  enumId:             number;
  slug:               string;
  rawName:            string | null;
  rawType:            string | null;
  rawNames:           string[];
  valueKind:          string;
  normalizeKind:      string;
  projectTargetType:  string | null;
  projectTargetPath:  string | null;
  projectKind:        string | null;
  firstSeenSourceTag: number | null;
  lastSeenSourceTag:  number | null;
}

// Existing raw snapshot row used for reuse checks.
interface SnapshotRow {
  id:           string;
  cardId:       string;
  snapshotHash: string;
  sourceTags:   number[];
}

// source_versions row used by import guards.
interface SourceVersionRow {
  sourceTag:           number;
  build:               number | null;
  sourceHash:          string;
  importEngineVersion: string | null;
  status:              string;
}

// source_versions write payload used by status updates.
interface SourceVersionWriteInput {
  sourceTag:    number;
  build:        number | null;
  sourceHash:   string;
  sourceCommit: string | null | undefined;
  sourceUri:    string | null | undefined;
  importEngineVersion: string | null | undefined;
}

const cardSetEnumId = 183;
const cardSetRawName = 'CARD_SET';

// Modeled set ids accepted by downstream projection.
function isModeledSetId(setId: string): boolean {
  return setId.length > 0 && !isHsdataPlaceholderSetId(setId);
}

// Completed raw hsdata import report.
export interface ImportHsdataReport {
  dryRun:                boolean;
  skipped:               boolean;
  sourceTag:             number;
  build:                 number;
  sourceHash:            string;
  entityCount:           number;
  insertedSnapshots:     number;
  reusedSnapshots:       number;
  insertedTagRows:       number;
  discoveredTagCount:    number;
  updatedDiscoveredTags: number;
  fallbackTagRowCount:   number;
  latestSnapshotCount:   number;
  discoveredTags:        number[];
}

// Parsed hsdata payload accepted by the shared import path.
export interface ImportParsedHsdataInput {
  parsed: ParsedHsdata;
  sourceTag: number;
  sourceHash: string;
  sourceCommit?: string | null;
  sourceUri?: string | null;
  importEngineVersion?: string | null;
  dryRun?: boolean;
  force?: boolean;
  onProgress?: (input: {
    phase: 'parsing_entities' | 'writing_batches' | 'finalizing_source_tag';
    message: string;
    totalEntityCount?: number | null;
    completedEntityCount?: number | null;
    totalBatchCount?: number | null;
    completedBatchCount?: number | null;
    currentBatchIndex?: number | null;
    totalWorkCount?: number | null;
    completedWorkCount?: number | null;
    workLabel?: string | null;
  }) => void | Promise<void>;
}

// Stable sha256 digest.
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// Deterministic JSON serialization for snapshot hashing.
function canonicalizeJson(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalizeJson(item)).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalizeJson(object[key])}`).join(',')}}`;
}

// Hash of canonical JSON payloads.
function hashCanonicalJson(value: unknown): string {
  return sha256(canonicalizeJson(value));
}

// Snapshot hash payload reduced from one normalized entity.
function normalizeSnapshotPayload(input: HsdataSnapshotInput) {
  return {
    cardId:           input.cardId,
    dbfId:            input.dbfId,
    entityXmlVersion: input.entityXmlVersion,
    tags:             input.tags.map(tag => ({
      enumId:         tag.enumId,
      rawName:        tag.rawName,
      rawType:        tag.rawType,
      rawValue:       tag.rawValue,
      locStringValue: tag.locStringValue,
      cardRefCardId:  tag.cardRefCardId,
      tagOrder:       tag.tagOrder,
      rawPayload:     tag.rawPayload,
    })),
    extraPayload:     input.extraPayload,
  };
}

// Snapshot hash derived from the canonical entity payload.
export function computeHsdataSnapshotHash(input: HsdataSnapshotInput): string {
  return hashCanonicalJson(normalizeSnapshotPayload(input));
}

// Parsed entity assembled from normalized snapshot content.
export function buildParsedEntity(input: HsdataSnapshotInput): ParsedEntity {
  return {
    cardId:           input.cardId,
    dbfId:            input.dbfId,
    entityXmlVersion: input.entityXmlVersion,
    tags:             input.tags,
    extraPayload:     input.extraPayload,
    snapshotHash:     computeHsdataSnapshotHash(input),
  };
}

// Stable discovered-tag slug.
function slugify(rawName: string, enumId: number): string {
  const base = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${base || 'tag'}-${enumId}`;
}

// Map key for cardId plus snapshotHash lookups.
function snapshotKey(cardId: string, snapshotHash: string): string {
  return `${cardId}\u0000${snapshotHash}`;
}

// Predictable query-sized chunks for large lists.
function chunkValues<T>(values: T[], size = 2000): T[][] {
  if (values.length <= size) {
    return [values];
  }

  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

// Sorted unique integers.
function sortUniqueIntegers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

// CARD_SET tag detection in raw tag payloads.
function isCardSetTag(tag: RawTagInput): boolean {
  return tag.enumId === cardSetEnumId || tag.rawName === cardSetRawName;
}

// Integer-like set references parsed from raw tags.
function parseTagIntValue(tag: RawTagInput): number | null {
  if (tag.rawValue == null || tag.rawValue.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(tag.rawValue, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// Distinct set dbf ids referenced by parsed entities.
function collectSetDbfIds(entities: ParsedEntity[]): number[] {
  return sortUniqueIntegers(
    entities
      .flatMap(entity => entity.tags)
      .filter(tag => isCardSetTag(tag))
      .map(tag => parseTagIntValue(tag))
      .filter((value): value is number => value != null),
  );
}

// Projected value kind for one raw tag.
function guessValueKind(tag: RawTagInput, existing: ExistingTagRow | undefined): TagValueKind {
  const configured = existing?.valueKind;

  if (configured === 'bool'
    || configured === 'card_ref'
    || configured === 'int'
    || configured === 'json'
    || configured === 'loc_string'
    || configured === 'string') {
    return configured;
  }

  if (tag.rawType === 'LocString') return 'loc_string';
  if (tag.rawType === 'Card') return 'card_ref';
  if (tag.rawType === 'Int') return 'int';
  if (tag.rawType === 'String') return 'string';

  return 'json';
}

// Typed storage representation resolved from one raw tag.
function resolveTagValue(tag: RawTagInput, existing: ExistingTagRow | undefined) {
  const valueKind = guessValueKind(tag, existing);
  const parsedInt = tag.rawValue != null ? Number.parseInt(tag.rawValue, 10) : null;
  const isInt = parsedInt != null && Number.isFinite(parsedInt);

  if (valueKind === 'bool') {
    if (!isInt || (parsedInt !== 0 && parsedInt !== 1)) {
      return {
        valueKind:   'json' as const,
        parseStatus: 'fallback' as const,
        jsonValue:   { value: tag.rawValue },
      };
    }

    return {
      valueKind,
      parseStatus: 'parsed' as const,
      boolValue:   parsedInt === 1,
    };
  }

  if (valueKind === 'int') {
    if (!isInt) {
      return {
        valueKind:   'json' as const,
        parseStatus: 'fallback' as const,
        jsonValue:   { value: tag.rawValue },
      };
    }

    return {
      valueKind,
      parseStatus: 'parsed' as const,
      intValue:    parsedInt,
    };
  }

  if (valueKind === 'string') {
    return {
      valueKind,
      parseStatus: 'parsed' as const,
      stringValue: tag.rawValue ?? '',
    };
  }

  if (valueKind === 'card_ref') {
    return {
      valueKind,
      parseStatus:   tag.cardRefCardId ? 'parsed' as const : 'fallback' as const,
      cardRefCardId: tag.cardRefCardId,
      jsonValue:     tag.cardRefCardId ? null : { value: tag.rawValue },
    };
  }

  if (valueKind === 'loc_string') {
    return {
      valueKind,
      parseStatus:    tag.locStringValue ? 'parsed' as const : 'fallback' as const,
      locStringValue: tag.locStringValue,
      jsonValue:      tag.locStringValue ? null : tag.rawPayload,
    };
  }

  return {
    valueKind:   'json' as const,
    parseStatus: 'fallback' as const,
    jsonValue:   tag.locStringValue ?? tag.rawValue ?? tag.rawPayload,
  };
}

// source_versions row loader for import guards.
async function getSourceVersion(sourceTag: number): Promise<SourceVersionRow | null> {
  return await db.select({
    sourceTag:  SourceVersion.sourceTag,
    build:      SourceVersion.build,
    sourceHash: SourceVersion.sourceHash,
    importEngineVersion: SourceVersion.importEngineVersion,
    status:     SourceVersion.status,
  })
    .from(SourceVersion)
    .where(eq(SourceVersion.sourceTag, sourceTag))
    .then(rows => rows[0] ?? null);
}

// Discovered tag definitions needed by one import batch.
async function getExistingTags(tx: DbTx, enumIds: number[]): Promise<Map<number, ExistingTagRow>> {
  const rows: ExistingTagRow[] = [];

  for (const chunk of chunkValues(enumIds)) {
    if (chunk.length === 0) continue;

    const result = await tx.select({
      enumId:             Tag.enumId,
      slug:               Tag.slug,
      rawName:            Tag.rawName,
      rawType:            Tag.rawType,
      rawNames:           Tag.rawNames,
      valueKind:          Tag.valueKind,
      normalizeKind:      Tag.normalizeKind,
      projectTargetType:  Tag.projectTargetType,
      projectTargetPath:  Tag.projectTargetPath,
      projectKind:        Tag.projectKind,
      firstSeenSourceTag: Tag.firstSeenSourceTag,
      lastSeenSourceTag:  Tag.lastSeenSourceTag,
    })
      .from(Tag)
      .where(inArray(Tag.enumId, chunk));

    rows.push(...result);
  }

  return new Map(rows.map(row => [row.enumId, row]));
}

// Existing set ids needed for pre-import validation.
async function loadExistingSetDbfIds(dbfIds: number[]): Promise<Set<number>> {
  const rows: Array<{ dbfId: number | null, setId: string }> = [];

  for (const chunk of chunkValues(dbfIds)) {
    if (chunk.length === 0) continue;

    const result = await db.select({
      dbfId: HearthstoneSet.dbfId,
      setId: HearthstoneSet.setId,
    })
      .from(HearthstoneSet)
      .where(inArray(HearthstoneSet.dbfId, chunk));

    rows.push(...result);
  }

  return new Set(
    rows
      .filter((row): row is { dbfId: number, setId: string } => row.dbfId != null)
      .filter(row => isModeledSetId(row.setId))
      .map(row => row.dbfId),
  );
}

// Placeholder set ids already present for the provided dbf ids.
async function loadPlaceholderSetDbfIds(dbfIds: number[]): Promise<Set<number>> {
  const rows: Array<{ dbfId: number | null, setId: string }> = [];

  for (const chunk of chunkValues(dbfIds)) {
    if (chunk.length === 0) continue;

    const result = await db.select({
      dbfId: HearthstoneSet.dbfId,
      setId: HearthstoneSet.setId,
    })
      .from(HearthstoneSet)
      .where(inArray(HearthstoneSet.dbfId, chunk));

    rows.push(...result);
  }

  return new Set(
    rows
      .filter((row): row is { dbfId: number, setId: string } => row.dbfId != null)
      .filter(row => isHsdataPlaceholderSetId(row.setId))
      .map(row => row.dbfId),
  );
}

// Placeholder set rows inserted so missing dependencies become explicit.
async function insertPlaceholderSets(dbfIds: number[]): Promise<number> {
  if (dbfIds.length === 0) {
    return 0;
  }

  const existingPlaceholderDbfIds = await loadPlaceholderSetDbfIds(dbfIds);
  const missingPlaceholderDbfIds = dbfIds.filter(dbfId => !existingPlaceholderDbfIds.has(dbfId));

  if (missingPlaceholderDbfIds.length === 0) {
    return 0;
  }

  await db.insert(HearthstoneSet).values(
    missingPlaceholderDbfIds.map(dbfId => ({
      setId:         buildHsdataPlaceholderSetId(dbfId),
      dbfId,
      slug:          null,
      rawName:       null,
      type:          'unknown',
      releaseDate:   '',
      cardCountFull: null,
      cardCount:     null,
      group:         null,
    })),
  );

  return missingPlaceholderDbfIds.length;
}

// Set ids still missing from the model tables.
async function findMissingSetDbfIds(dbfIds: number[]): Promise<number[]> {
  if (dbfIds.length === 0) {
    return [];
  }

  const existingDbfIds = await loadExistingSetDbfIds(dbfIds);
  return dbfIds.filter(dbfId => !existingDbfIds.has(dbfId));
}

// Discovered tag metadata upserted before snapshot rows are written.
async function upsertDiscoveredTags(
  tx: DbTx,
  sourceTag: number,
  tags: RawTagInput[],
  dryRun: boolean,
): Promise<{ existing: Map<number, ExistingTagRow>, discovered: number[], updated: number }> {
  const enumIds = sortUniqueIntegers(tags.map(tag => tag.enumId));
  const existing = await getExistingTags(tx, enumIds);
  const discovered: number[] = [];
  let updated = 0;

  const firstSeenByEnum = new Map<number, RawTagInput>();
  for (const tag of tags) {
    if (!firstSeenByEnum.has(tag.enumId)) {
      firstSeenByEnum.set(tag.enumId, tag);
    }
  }

  for (const enumId of enumIds) {
    const input = firstSeenByEnum.get(enumId)!;
    const row = existing.get(enumId);
    const guessedKind = guessValueKind(input, row);

    if (!row) {
      discovered.push(enumId);

      if (!dryRun) {
        await tx.insert(Tag).values({
          enumId,
          slug:               slugify(input.rawName, enumId),
          name:               input.rawName || null,
          rawName:            input.rawName || null,
          rawType:            input.rawType || null,
          rawNames:           input.rawName ? [input.rawName] : [],
          valueKind:          guessedKind,
          normalizeKind:      'identity',
          normalizeConfig:    {},
          projectTargetType:  null,
          projectTargetPath:  null,
          projectKind:        null,
          projectConfig:      {},
          status:             'discovered',
          description:        null,
          firstSeenSourceTag: sourceTag,
          lastSeenSourceTag:  sourceTag,
        });
      }

      existing.set(enumId, {
        enumId,
        slug:               slugify(input.rawName, enumId),
        rawName:            input.rawName || null,
        rawType:            input.rawType || null,
        rawNames:           input.rawName ? [input.rawName] : [],
        valueKind:          guessedKind,
        normalizeKind:      'identity',
        projectTargetType:  null,
        projectTargetPath:  null,
        projectKind:        null,
        firstSeenSourceTag: sourceTag,
        lastSeenSourceTag:  sourceTag,
      });
      continue;
    }

    const nextRawNames = input.rawName && !row.rawNames.includes(input.rawName)
      ? [...row.rawNames, input.rawName].sort()
      : row.rawNames;

    const needsUpdate = nextRawNames !== row.rawNames
      || row.lastSeenSourceTag !== sourceTag
      || row.rawName == null
      || row.rawType == null;

    if (needsUpdate) {
      updated += 1;
    }

    if (needsUpdate && !dryRun) {
      await tx.update(Tag)
        .set({
          rawName:           row.rawName ?? input.rawName ?? null,
          rawType:           row.rawType ?? input.rawType ?? null,
          rawNames:          nextRawNames,
          lastSeenSourceTag: sourceTag,
        })
        .where(eq(Tag.enumId, enumId));
    }

    existing.set(enumId, {
      ...row,
      rawName:           row.rawName ?? input.rawName ?? null,
      rawType:           row.rawType ?? input.rawType ?? null,
      rawNames:          nextRawNames,
      lastSeenSourceTag: sourceTag,
    });
  }

  return { existing, discovered, updated };
}

// Reusable snapshots for the given card ids.
async function loadExistingSnapshots(tx: DbTx, cardIds: string[]): Promise<Map<string, SnapshotRow>> {
  const rows: SnapshotRow[] = [];

  for (const chunk of chunkValues(cardIds)) {
    if (chunk.length === 0) continue;

    const result = await tx.select({
      id:           RawEntitySnapshot.id,
      cardId:       RawEntitySnapshot.cardId,
      snapshotHash: RawEntitySnapshot.snapshotHash,
      sourceTags:   RawEntitySnapshot.sourceTags,
    })
      .from(RawEntitySnapshot)
      .where(inArray(RawEntitySnapshot.cardId, chunk));

    rows.push(...result);
  }

  return new Map(rows.map(row => [snapshotKey(row.cardId, row.snapshotHash), row]));
}

// Snapshots currently linked to one sourceTag.
async function loadSnapshotsForSourceTag(tx: DbTx, sourceTag: number): Promise<SnapshotRow[]> {
  return await tx.select({
    id:           RawEntitySnapshot.id,
    cardId:       RawEntitySnapshot.cardId,
    snapshotHash: RawEntitySnapshot.snapshotHash,
    sourceTags:   RawEntitySnapshot.sourceTags,
  })
    .from(RawEntitySnapshot)
    .where(sql<boolean>`${sourceTag} = ANY(${RawEntitySnapshot.sourceTags})`);
}

// Normalized tag rows inserted for one snapshot.
async function insertSnapshotTags(
  tx: DbTx,
  snapshotId: string,
  tags: RawTagInput[],
  tagMap: Map<number, ExistingTagRow>,
  dbfIdByCardId: Map<string, number>,
): Promise<number> {
  if (tags.length === 0) {
    return 0;
  }

  const rows = tags.map(tag => {
    const resolved = resolveTagValue(tag, tagMap.get(tag.enumId));
    const cardRefCardId = 'cardRefCardId' in resolved ? resolved.cardRefCardId ?? null : null;

    return {
      snapshotId,
      enumId:         tag.enumId,
      tagOrder:       tag.tagOrder,
      rawName:        tag.rawName,
      rawType:        tag.rawType,
      rawPayload:     tag.rawPayload,
      valueKind:      resolved.valueKind,
      boolValue:      'boolValue' in resolved ? resolved.boolValue ?? null : null,
      intValue:       'intValue' in resolved ? resolved.intValue ?? null : null,
      stringValue:    'stringValue' in resolved ? resolved.stringValue ?? null : null,
      enumValue:      null,
      locStringValue: 'locStringValue' in resolved ? resolved.locStringValue ?? null : null,
      cardRefCardId,
      cardRefDbfId:   cardRefCardId ? dbfIdByCardId.get(cardRefCardId) ?? null : null,
      jsonValue:      'jsonValue' in resolved ? resolved.jsonValue ?? null : null,
      parseStatus:    resolved.parseStatus,
    };
  });

  await tx.insert(RawEntitySnapshotTag).values(rows);
  return rows.length;
}

// Tag rows deleted for the provided snapshot ids.
async function deleteSnapshotTags(tx: DbTx, snapshotIds: string[]) {
  for (const chunk of chunkValues(snapshotIds)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.delete(RawEntitySnapshotTag)
      .where(inArray(RawEntitySnapshotTag.snapshotId, chunk));
  }
}

// source_versions moved into processing before import work begins.
async function upsertSourceVersionProcessing(
  input: SourceVersionWriteInput,
) {
  await db.insert(SourceVersion)
    .values({
      sourceTag:           input.sourceTag,
      sourceCommit:        input.sourceCommit ?? '',
      build:               input.build,
      sourceHash:          input.sourceHash,
      sourceUri:           input.sourceUri ?? '',
      importEngineVersion: input.importEngineVersion ?? null,
      status:              'processing',
      projectionStatus:    'not_started',
      projectionError:     null,
      importedAt:          null,
      projectedAt:         null,
    })
    .onConflictDoUpdate({
      target: [SourceVersion.sourceTag],
      set:    {
        sourceCommit:        input.sourceCommit ?? '',
        build:               input.build,
        sourceHash:          input.sourceHash,
        sourceUri:           input.sourceUri ?? '',
        importEngineVersion: input.importEngineVersion ?? null,
        status:              'processing',
        importedAt:          null,
      },
    });
}

// source_versions row marked as completed.
async function markSourceVersionCompleted(sourceTag: number, importedAt: Date) {
  await db.update(SourceVersion)
    .set({
      status:           'completed',
      projectionStatus: 'not_started',
      projectionError:  null,
      importedAt,
      projectedAt:      null,
    })
    .where(eq(SourceVersion.sourceTag, sourceTag));
}

// Failed source_versions state persisted.
async function upsertSourceVersionFailed(input: SourceVersionWriteInput) {
  await db.insert(SourceVersion)
    .values({
      sourceTag:           input.sourceTag,
      sourceCommit:        input.sourceCommit ?? '',
      build:               input.build,
      sourceHash:          input.sourceHash,
      sourceUri:           input.sourceUri ?? '',
      importEngineVersion: input.importEngineVersion ?? null,
      status:              'failed',
      projectionStatus:    'not_started',
      projectionError:     null,
      importedAt:          null,
      projectedAt:         null,
    })
    .onConflictDoUpdate({
      target: [SourceVersion.sourceTag],
      set:    {
        sourceCommit:        input.sourceCommit ?? '',
        build:               input.build,
        sourceHash:          input.sourceHash,
        sourceUri:           input.sourceUri ?? '',
        importEngineVersion: input.importEngineVersion ?? null,
        status:              'failed',
        importedAt:          null,
      },
    });
}

// Source version marked as failed unless the same completed import already exists.
async function markSourceVersionFailedIfNeeded(
  input: SourceVersionWriteInput,
  sourceVersion: SourceVersionRow | null,
) {
  if (sourceVersion?.status === 'completed' && sourceVersion.sourceHash === input.sourceHash) {
    return;
  }

  await upsertSourceVersionFailed(input);
}

// Skip decision for an identical completed source.
function shouldSkipSourceVersionImport(
  sourceVersion: SourceVersionRow | null,
  sourceHash: string,
  force: boolean,
): boolean {
  if (force) {
    return false;
  }

  return sourceVersion?.status === 'completed' && sourceVersion.sourceHash === sourceHash;
}

// sourceTag overwrite rules enforced before import begins.
function assertSourceVersionImportable(
  sourceVersion: SourceVersionRow | null,
  sourceTag: number,
  sourceHash: string,
  force: boolean,
) {
  if (force || !sourceVersion) {
    return;
  }

  if (sourceVersion.sourceHash !== '' && sourceVersion.sourceHash !== sourceHash) {
    throw new Error(`sourceTag ${sourceTag} already exists with a different sourceHash; rerun with force=true to overwrite`);
  }
}

// Parsed raw import applied inside one transaction.
async function applyHsdataImport(
  tx: DbTx,
  input: {
    parsed: ParsedHsdata;
    sourceTag: number;
    dryRun: boolean;
    force: boolean;
    onProgress?: ImportParsedHsdataInput['onProgress'];
  },
): Promise<Omit<ImportHsdataReport, 'build' | 'dryRun' | 'skipped' | 'sourceHash' | 'sourceTag'>> {
  const allTags = input.parsed.entities.flatMap(entity => entity.tags);
  const dbfIdByCardId = new Map(input.parsed.entities.map(entity => [entity.cardId, entity.dbfId]));
  const { existing, discovered, updated } = await upsertDiscoveredTags(
    tx,
    input.sourceTag,
    allTags,
    input.dryRun,
  );

  const fallbackTagRowCount = input.parsed.entities.reduce((count, entity) => {
    return count + entity.tags.filter(tag => {
      const resolved = resolveTagValue(tag, existing.get(tag.enumId));
      return resolved.parseStatus === 'fallback';
    }).length;
  }, 0);

  const previousSnapshots = await loadSnapshotsForSourceTag(tx, input.sourceTag);
  const previousSnapshotIds = new Set(previousSnapshots.map(row => row.id));
  const existingSnapshots = await loadExistingSnapshots(
    tx,
    [...new Set(input.parsed.entities.map(entity => entity.cardId))],
  );

  const newEntities: ParsedEntity[] = [];
  const sourceTagUpdates: Array<{ id: string, sourceTags: number[] }> = [];
  const snapshotIdByKey = new Map<string, string>();
  const targetSnapshotIds: string[] = [];
  let insertedSnapshots = 0;
  let reusedSnapshots = 0;

  for (const [index, entity] of input.parsed.entities.entries()) {
    const key = snapshotKey(entity.cardId, entity.snapshotHash);
    const existingSnapshot = existingSnapshots.get(key);

    if (!existingSnapshot) {
      insertedSnapshots += 1;
      newEntities.push(entity);
      continue;
    }

    reusedSnapshots += 1;
    targetSnapshotIds.push(existingSnapshot.id);
    snapshotIdByKey.set(key, existingSnapshot.id);

    if (!existingSnapshot.sourceTags.includes(input.sourceTag)) {
      sourceTagUpdates.push({
        id:         existingSnapshot.id,
        sourceTags: sortUniqueIntegers([...existingSnapshot.sourceTags, input.sourceTag]),
      });
    }

    if (
      input.onProgress
      && (index < 10 || index + 1 === input.parsed.entities.length || (index + 1) % 100 === 0)
    ) {
      void input.onProgress({
        phase:                'parsing_entities',
        message:              `Analyzing ${index + 1} of ${input.parsed.entities.length} entities for raw snapshot reuse`,
        totalEntityCount:     input.parsed.entities.length,
        completedEntityCount: index + 1,
        totalWorkCount:       input.parsed.entities.length,
        completedWorkCount:   index + 1,
        workLabel:            'entity',
      });
    }
  }

  const newSnapshotIds = new Map<string, string>();

  if (!input.dryRun && newEntities.length > 0) {
    const inserted = await tx.insert(RawEntitySnapshot)
      .values(newEntities.map(entity => ({
        cardId:           entity.cardId,
        dbfId:            entity.dbfId,
        sourceTags:       [input.sourceTag],
        entityXmlVersion: entity.entityXmlVersion,
        snapshotHash:     entity.snapshotHash,
        extraPayload:     entity.extraPayload,
        isLatest:         false,
      })))
      .returning({
        id:           RawEntitySnapshot.id,
        cardId:       RawEntitySnapshot.cardId,
        snapshotHash: RawEntitySnapshot.snapshotHash,
      });

    for (const row of inserted) {
      const key = snapshotKey(row.cardId, row.snapshotHash);
      newSnapshotIds.set(key, row.id);
      snapshotIdByKey.set(key, row.id);
    }
  }

  if (input.dryRun) {
    for (const entity of newEntities) {
      const key = snapshotKey(entity.cardId, entity.snapshotHash);
      const snapshotId = `dry-run:${entity.cardId}:${entity.snapshotHash}`;
      newSnapshotIds.set(key, snapshotId);
      snapshotIdByKey.set(key, snapshotId);
    }
  }

  for (const entity of newEntities) {
    const snapshotId = newSnapshotIds.get(snapshotKey(entity.cardId, entity.snapshotHash));

    if (!snapshotId) {
      throw new Error(`Inserted snapshot id not found for cardId ${entity.cardId}`);
    }

    targetSnapshotIds.push(snapshotId);
  }

  const uniqueTargetSnapshotIds = [...new Set(targetSnapshotIds)];
  const removedPreviousSnapshots = previousSnapshots.filter(snapshot => !uniqueTargetSnapshotIds.includes(snapshot.id));
  let insertedTagRows = 0;
  const tagEntities = input.force ? input.parsed.entities : newEntities;
  const totalWriteWorkCount = sourceTagUpdates.length
    + removedPreviousSnapshots.length
    + tagEntities.length
    + (newEntities.length > 0 ? 1 : 0)
    + (previousSnapshotIds.size > 0 ? 1 : 0)
    + (input.force ? 1 : 0)
    + (uniqueTargetSnapshotIds.length > 0 ? 1 : 0);
  let completedWriteWorkCount = 0;

  if (input.onProgress) {
    void input.onProgress({
      phase:                'writing_batches',
      message:              'Writing raw snapshots, sourceTag links, and tag rows into the local database',
      totalEntityCount:     tagEntities.length,
      completedEntityCount: 0,
      totalBatchCount:      1,
      completedBatchCount:  0,
      currentBatchIndex:    0,
      totalWorkCount:       totalWriteWorkCount,
      completedWorkCount:   0,
      workLabel:            'operation',
    });
  }

  if (!input.dryRun) {
    if (newEntities.length > 0) {
      completedWriteWorkCount += 1;
    }

    for (const update of sourceTagUpdates) {
      await tx.update(RawEntitySnapshot)
        .set({ sourceTags: update.sourceTags })
        .where(eq(RawEntitySnapshot.id, update.id));
      completedWriteWorkCount += 1;
    }

    for (const [index, previousSnapshot] of previousSnapshots.entries()) {
      if (uniqueTargetSnapshotIds.includes(previousSnapshot.id)) {
        continue;
      }

      const nextSourceTags = previousSnapshot.sourceTags.filter(value => value !== input.sourceTag);

      if (nextSourceTags.length === 0) {
        await tx.delete(RawEntitySnapshot)
          .where(eq(RawEntitySnapshot.id, previousSnapshot.id));
        completedWriteWorkCount += 1;
        continue;
      }

      await tx.update(RawEntitySnapshot)
        .set({
          sourceTags: nextSourceTags,
          isLatest:   false,
        })
        .where(eq(RawEntitySnapshot.id, previousSnapshot.id));
      completedWriteWorkCount += 1;

      if (
        input.onProgress
        && (index < 10 || index + 1 === previousSnapshots.length || (index + 1) % 100 === 0)
      ) {
        void input.onProgress({
          phase:                'writing_batches',
          message:              `Rewriting sourceTag links for ${index + 1} of ${previousSnapshots.length} previous snapshots`,
          totalEntityCount:     tagEntities.length,
          completedEntityCount: 0,
          totalBatchCount:      1,
          completedBatchCount:  0,
          currentBatchIndex:    0,
          totalWorkCount:       totalWriteWorkCount,
          completedWorkCount:   completedWriteWorkCount,
          workLabel:            'operation',
        });
      }
    }

    if (previousSnapshotIds.size > 0) {
      await tx.update(RawEntitySnapshot)
        .set({ isLatest: false })
        .where(inArray(RawEntitySnapshot.id, [...previousSnapshotIds]));
      completedWriteWorkCount += 1;
    }

    if (input.force) {
      await deleteSnapshotTags(tx, uniqueTargetSnapshotIds);
      completedWriteWorkCount += 1;
    }

    for (const [index, entity] of tagEntities.entries()) {
      const snapshotId = snapshotIdByKey.get(snapshotKey(entity.cardId, entity.snapshotHash))!;
      insertedTagRows += await insertSnapshotTags(tx, snapshotId, entity.tags, existing, dbfIdByCardId);
      completedWriteWorkCount += 1;

      if (
        input.onProgress
        && (index < 10 || index + 1 === tagEntities.length || (index + 1) % 100 === 0)
      ) {
        void input.onProgress({
          phase:                'writing_batches',
          message:              `Writing tag rows for ${index + 1} of ${tagEntities.length} snapshots`,
          totalEntityCount:     tagEntities.length,
          completedEntityCount: index + 1,
          totalBatchCount:      1,
          completedBatchCount:  0,
          currentBatchIndex:    0,
          totalWorkCount:       totalWriteWorkCount,
          completedWorkCount:   completedWriteWorkCount,
          workLabel:            'operation',
        });
      }
    }

    if (uniqueTargetSnapshotIds.length > 0) {
      await tx.update(RawEntitySnapshot)
        .set({ isLatest: true })
        .where(inArray(RawEntitySnapshot.id, uniqueTargetSnapshotIds));
      completedWriteWorkCount += 1;
    }
  } else {
    insertedTagRows = tagEntities.reduce((count, entity) => count + entity.tags.length, 0);
  }

  return {
    entityCount:           input.parsed.entities.length,
    insertedSnapshots,
    reusedSnapshots,
    insertedTagRows,
    discoveredTagCount:    discovered.length,
    updatedDiscoveredTags: updated,
    fallbackTagRowCount,
    latestSnapshotCount:   uniqueTargetSnapshotIds.length,
    discoveredTags:        discovered,
  };
}

// Parsed hsdata payload imported through the shared raw archive path.
export async function importParsedHsdata(input: ImportParsedHsdataInput): Promise<ImportHsdataReport> {
  const dryRun = input.dryRun ?? false;
  const force = input.force ?? false;
  const profiler = createHsdataProfiler('raw', {
    sourceTag:  input.sourceTag,
    build:      input.parsed.build,
    dryRun,
    force,
    entityCount: input.parsed.entities.length,
  });
  const sourceVersion = await getSourceVersion(input.sourceTag);
  profiler.mark('load_source_version');

  const missingSetDbfIds = await findMissingSetDbfIds(collectSetDbfIds(input.parsed.entities));
  profiler.mark('check_missing_sets', {
    missingSetDbfIdCount: missingSetDbfIds.length,
  });

  if (missingSetDbfIds.length > 0) {
    const insertedPlaceholderSetCount = await insertPlaceholderSets(missingSetDbfIds);
    profiler.mark('insert_placeholder_sets', {
      insertedPlaceholderSetCount,
    });

    if (!dryRun) {
      await markSourceVersionFailedIfNeeded({
        sourceTag:    input.sourceTag,
        build:        input.parsed.build,
        sourceHash:   input.sourceHash,
        sourceCommit: input.sourceCommit,
        sourceUri:    input.sourceUri,
        importEngineVersion: input.importEngineVersion,
      }, sourceVersion);
    }

    const action = insertedPlaceholderSetCount > 0
      ? `Inserted ${insertedPlaceholderSetCount} placeholder set row(s)`
      : 'Placeholder set row(s) already exist';

    throw new Error(
      `[hearthstone][hsdata-import] missing set rows for dbfId(s): ${missingSetDbfIds.join(', ')}. ${action}. Complete set modeling before retrying import.`,
    );
  }

  if (shouldSkipSourceVersionImport(sourceVersion, input.sourceHash, force)) {
    profiler.mark('skip_existing_source');
    profiler.done({ outcome: 'skipped' });

    return {
      dryRun,
      skipped:               true,
      sourceTag:             input.sourceTag,
      build:                 input.parsed.build,
      sourceHash:            input.sourceHash,
      entityCount:           input.parsed.entities.length,
      insertedSnapshots:     0,
      reusedSnapshots:       0,
      insertedTagRows:       0,
      discoveredTagCount:    0,
      updatedDiscoveredTags: 0,
      fallbackTagRowCount:   0,
      latestSnapshotCount:   0,
      discoveredTags:        [],
    };
  }

  assertSourceVersionImportable(sourceVersion, input.sourceTag, input.sourceHash, force);

  await input.onProgress?.({
    phase:                'parsing_entities',
    message:              'Analyzing normalized entities and snapshot reuse',
    totalEntityCount:     input.parsed.entities.length,
    completedEntityCount: 0,
    totalBatchCount:      1,
    completedBatchCount:  0,
    currentBatchIndex:    0,
    totalWorkCount:       input.parsed.entities.length,
    completedWorkCount:   0,
    workLabel:            'entity',
  });

  if (!dryRun) {
    await upsertSourceVersionProcessing(
      {
        sourceTag:    input.sourceTag,
        build:        input.parsed.build,
        sourceHash:   input.sourceHash,
        sourceCommit: input.sourceCommit,
        sourceUri:    input.sourceUri,
        importEngineVersion: input.importEngineVersion,
      },
    );
    profiler.mark('mark_processing');
  }

  try {
    return await db.transaction(async tx => {
      const applied = await applyHsdataImport(tx, {
        parsed:     input.parsed,
        sourceTag:  input.sourceTag,
        dryRun,
        force,
        onProgress: input.onProgress,
      });

      return {
        dryRun,
        skipped:    false,
        sourceTag:  input.sourceTag,
        build:      input.parsed.build,
        sourceHash: input.sourceHash,
        ...applied,
      } satisfies ImportHsdataReport;
    }).then(async report => {
      profiler.mark('apply_import', {
        insertedSnapshots: report.insertedSnapshots,
        reusedSnapshots:   report.reusedSnapshots,
        insertedTagRows:   report.insertedTagRows,
      });

      if (!dryRun) {
        await input.onProgress?.({
          phase:                'finalizing_source_tag',
          message:              'Finalizing sourceTag status and latest snapshot markers',
          totalEntityCount:     input.parsed.entities.length,
          completedEntityCount: input.parsed.entities.length,
          totalBatchCount:      1,
          completedBatchCount:  1,
          currentBatchIndex:    1,
          totalWorkCount:       1,
          completedWorkCount:   0,
          workLabel:            'sourceTag',
        });
        await markSourceVersionCompleted(input.sourceTag, new Date());
        profiler.mark('mark_completed');
        await input.onProgress?.({
          phase:                'finalizing_source_tag',
          message:              'Finalized sourceTag status and latest snapshot markers',
          totalEntityCount:     input.parsed.entities.length,
          completedEntityCount: input.parsed.entities.length,
          totalBatchCount:      1,
          completedBatchCount:  1,
          currentBatchIndex:    1,
          totalWorkCount:       1,
          completedWorkCount:   1,
          workLabel:            'sourceTag',
        });
      }

      profiler.done({ outcome: 'completed' });
      return report;
    });
  } catch (error) {
    if (!dryRun) {
      await markSourceVersionFailedIfNeeded({
        sourceTag:    input.sourceTag,
        build:        input.parsed.build,
        sourceHash:   input.sourceHash,
        sourceCommit: input.sourceCommit,
        sourceUri:    input.sourceUri,
        importEngineVersion: input.importEngineVersion,
      }, sourceVersion);
    }

    console.error('[hearthstone][hsdata-import] failed', {
      sourceTag: input.sourceTag,
      build:     input.parsed.build,
      error,
    });

    profiler.mark('failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    profiler.done({ outcome: 'failed' });

    throw error;
  }
}
