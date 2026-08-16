import canonicalize from 'canonicalize';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import {
  PatchState,
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  Set as HearthstoneSet,
} from '@tcg-cards/db/schema/local/hearthstone';
import { Patch } from '@tcg-cards/db/schema/shared/hearthstone';

import {
  buildHsdataPlaceholderSetId,
  isHsdataPlaceholderSetId,
} from './hsdata-set-placeholder';
import { importDiscoveredTags } from '@tcg-cards/console-api/lib/hearthstone/tag-commit';
import { readEditorIdentity } from '../../runtime-config';
import { createHsdataProfiler } from './hsdata-profile';

// Shared transaction shape for import helpers.
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Generic JSON payload fragments stored during import.
export type JsonMap = Record<string, unknown>;

// Normalized tag value shapes used by raw tag storage.
type TagValueKind
  = | 'bool'
    | 'card'
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
  cardValue:      string | null;
  tagOrder:       number;
}

// Snapshot content used to derive one parsed entity and snapshot hash.
export interface HsdataSnapshotInput {
  cardId:           string;
  dbfId:            number;
  entityXmlVersion: number;
  tags:             RawTagInput[];
  extraPayload:     JsonMap;
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

// Existing raw snapshot row used for reuse checks.
interface SnapshotRow {
  id:           string;
  cardId:       string;
  snapshotHash: string;
  sourceTags:   number[];
}

// patch_states row used by import guards.
interface PatchStateRow {
  buildNumber:  number;
  importStatus: string;
}

// patches row for import guards (hash-based dedup).
interface PatchRow {
  buildNumber: number;
  hash:        string;
}

// patch_states write payload used by status updates.
interface PatchStateWriteInput {
  buildNumber: number;
  hash:        string;
  name:        string;
  shortName:   string;
  commit:      string | null | undefined;
  uri:         string | null | undefined;
}

// Narrow view of the PostgreSQL error fields that matter during import failures.
interface DbErrorCause {
  code?:       string;
  detail?:     string;
  hint?:       string;
  constraint?: string;
  table?:      string;
  column?:     string;
  position?:   string;
}

// Import-side batch metadata attached to rethrown query failures for diagnosis.
interface ImportBatchErrorContext {
  operation:               string;
  chunkRowCount:           number;
  estimatedParameterCount: number;
}

const cardSetEnumId = 183;
const cardSetRawName = 'CARD_SET';
const maxQueryParameterCount = 65534;
const queryParameterSafetyMargin = 1024;
const rawEntitySnapshotInsertColumnCount = 7;
const rawEntitySnapshotTagInsertColumnCount = 16;
const placeholderSetInsertColumnCount = 9;

// Modeled set ids accepted by downstream projection.
function isModeledSetId(setId: string): boolean {
  return setId.length > 0 && !isHsdataPlaceholderSetId(setId);
}

// Completed raw hsdata import report.
export interface ImportHsdataReport {
  dryRun:                boolean;
  skipped:               boolean;
  buildNumber:           number;
  hash:                  string;
  entityCount:           number;
  insertedSnapshots:     number;
  reusedSnapshots:       number;
  insertedTagRows:       number;
  discoveredTagCount:    number;
  updatedDiscoveredTags: number;
  fallbackTagRowCount:   number;
  discoveredTags:        number[];
}

// Parsed hsdata payload accepted by the shared import path.
export interface ImportParsedHsdataInput {
  parsed:      ParsedHsdata;
  buildNumber: number;
  hash:        string;
  name:        string;
  commit?:     string | null;
  uri?:        string | null;
  dryRun?:     boolean;
  force?:      boolean;
  /** When true, only writes patches and patch_states — skips snapshot/tag/projection work. */
  patchOnly?:  boolean;
  onProgress?: (input: {
    phase:                 'parsing_entities' | 'writing_batches' | 'finalizing_source_tag';
    message:               string;
    totalEntityCount?:     number | null;
    completedEntityCount?: number | null;
    totalBatchCount?:      number | null;
    completedBatchCount?:  number | null;
    currentBatchIndex?:    number | null;
    totalWorkCount?:       number | null;
    completedWorkCount?:   number | null;
    workLabel?:            string | null;
  }) => void | Promise<void>;
}

function hashCanonicalJson(value: unknown): string {
  return Bun.SHA256.hash(canonicalize(value)!, 'hex') as string;
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
      cardValue:      tag.cardValue,
      tagOrder:       tag.tagOrder,
      rawPayload:     tag.rawPayload,
    })),
    extraPayload: input.extraPayload,
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

// Maximum row count that keeps one parameterized insert below PostgreSQL's bind limit.
function computeInsertBatchSize(columnCount: number, maxParameterCount = maxQueryParameterCount): number {
  const safeParameterCount = Math.max(1, maxParameterCount - queryParameterSafetyMargin);
  return Math.max(1, Math.floor(safeParameterCount / columnCount));
}

// Walks nested `cause` and wrapped `error` fields until the innermost error-like object.
function findInnermostError(error: unknown): unknown {
  let current = error;

  while (current != null && typeof current === 'object') {
    if ('error' in current && (current as { error?: unknown }).error != null) {
      current = (current as { error: unknown }).error;
      continue;
    }

    if ('cause' in current && (current as { cause?: unknown }).cause != null) {
      current = (current as { cause: unknown }).cause;
      continue;
    }

    break;
  }

  return current;
}

// Wraps one batch failure with the operation and estimated bind-parameter count.
function withImportBatchError(
  error: unknown,
  operation: string,
  chunkRowCount: number,
  columnCount: number,
) {
  return new Error(
    `${operation} failed for ${chunkRowCount} row(s) with about ${chunkRowCount * columnCount} parameters`,
    {
      cause: {
        error,
        operation,
        chunkRowCount,
        estimatedParameterCount: chunkRowCount * columnCount,
      } satisfies ImportBatchErrorContext & { error: unknown },
    },
  );
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
function guessValueKind(tag: RawTagInput): TagValueKind {
  if (tag.rawType === 'LocString') return 'loc_string';
  if (tag.rawType === 'Card') return 'card';
  if (tag.rawType === 'String') return 'string';

  return 'int';
}

// Typed storage representation resolved from one raw tag.
function resolveTagValue(tag: RawTagInput) {
  const valueKind = guessValueKind(tag);
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

  if (valueKind === 'card') {
    const parsedInt = tag.rawValue != null ? Number.parseInt(tag.rawValue, 10) : null;
    const dbfId = parsedInt != null && Number.isFinite(parsedInt) ? parsedInt : null;

    if (tag.cardValue) {
      return dbfId != null
        ? { valueKind, parseStatus: 'parsed' as const, cardValue: tag.cardValue, intValue: dbfId }
        : { valueKind, parseStatus: 'parsed' as const, cardValue: tag.cardValue };
    }

    if (dbfId != null) {
      return { valueKind, parseStatus: 'parsed' as const, intValue: dbfId };
    }

    return {
      valueKind,
      parseStatus: 'fallback' as const,
      jsonValue:   { value: tag.rawValue },
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

// patch_states row loader for import guards.
async function getPatchState(buildNumber: number): Promise<PatchStateRow | null> {
  return await db.select({
    buildNumber:  PatchState.buildNumber,
    importStatus: PatchState.importStatus,
  })
    .from(PatchState)
    .where(eq(PatchState.buildNumber, buildNumber))
    .then(rows => rows[0] ?? null);
}

// patches row loader for hash-based dedup.
async function getPatchRow(buildNumber: number): Promise<PatchRow | null> {
  return await db.select({
    buildNumber: Patch.buildNumber,
    hash:        Patch.hash,
  })
    .from(Patch)
    .where(eq(Patch.buildNumber, buildNumber))
    .then(rows => rows[0] ?? null);
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

  const insertBatchSize = computeInsertBatchSize(placeholderSetInsertColumnCount);

  for (const chunk of chunkValues(missingPlaceholderDbfIds, insertBatchSize)) {
    try {
      await db.insert(HearthstoneSet).values(
        chunk.map(dbfId => ({
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
    } catch (error) {
      throw withImportBatchError(
        error,
        'insert_placeholder_sets',
        chunk.length,
        placeholderSetInsertColumnCount,
      );
    }
  }

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
): Promise<number> {
  if (tags.length === 0) {
    return 0;
  }

  const rows = tags.map(tag => {
    const resolved = resolveTagValue(tag);
    const cardValue = 'cardValue' in resolved ? resolved.cardValue ?? null : null;

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
      cardValue,
      jsonValue:      'jsonValue' in resolved ? resolved.jsonValue ?? null : null,
      parseStatus:    resolved.parseStatus,
    };
  });

  const insertBatchSize = computeInsertBatchSize(rawEntitySnapshotTagInsertColumnCount);

  for (const chunk of chunkValues(rows, insertBatchSize)) {
    try {
      await tx.insert(RawEntitySnapshotTag).values(chunk);
    } catch (error) {
      throw withImportBatchError(
        error,
        'insert_raw_entity_snapshot_tags',
        chunk.length,
        rawEntitySnapshotTagInsertColumnCount,
      );
    }
  }

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

/** Computes shortName from a patch name (e.g. "26.0.0.198765") by removing the
 *  trailing buildNumber and stripping all trailing .0 segments, keeping at
 *  least two parts (e.g. → "26.0"). */
export function computeShortName(name: string, buildNumber: number) {
  const parts = name.split('.');
  // Remove trailing buildNumber segment.
  if (parts.length > 0 && Number(parts[parts.length - 1]) === buildNumber) {
    parts.pop();
  }
  // Strip all trailing .0 segments.
  while (parts.length > 2 && parts[parts.length - 1] === '0') {
    parts.pop();
  }
  return parts.join('.');
}

/** After inserting or updating a patch row, fixes any shortName collisions.
 *  For each group with duplicate shortNames, the smallest buildNumber keeps
 *  the shortName; all later ones fall back to name. */
async function fixShortNameCollisions() {
  const patches = await db.select({
    buildNumber: Patch.buildNumber,
    name:        Patch.name,
    shortName:   Patch.shortName,
  })
    .from(Patch)
    .orderBy(Patch.buildNumber);

  const seen = new Map<string, number>();
  const updates: Array<{ buildNumber: number, shortName: string }> = [];

  for (const p of patches) {
    const existing = seen.get(p.shortName);
    if (existing != null) {
      // Collision — the later (larger) build falls back to name.
      updates.push({ buildNumber: p.buildNumber, shortName: p.name });
    } else {
      seen.set(p.shortName, p.buildNumber);
    }
  }

  for (const u of updates) {
    await db.update(Patch)
      .set({ shortName: u.shortName })
      .where(eq(Patch.buildNumber, u.buildNumber));
  }
}

// patch_states moved into processing before import work begins.
// Also syncs a basic patch row so the FK is satisfied.
async function upsertPatchStateProcessing(
  input: PatchStateWriteInput,
) {
  await db.insert(PatchState)
    .values({
      buildNumber:      input.buildNumber,
      commit:           input.commit ?? '',
      uri:              input.uri ?? '',
      importStatus:     'processing',
      importError:      null,
      projectionStatus: 'not_started',
      projectionError:  null,
      importedAt:       null,
      projectedAt:      null,
    })
    .onConflictDoUpdate({
      target: [PatchState.buildNumber],
      set:    {
        commit:       input.commit ?? '',
        uri:          input.uri ?? '',
        importStatus: 'processing',
        importError:  null,
        importedAt:   null,
      },
    });

  await db.insert(Patch)
    .values({
      buildNumber: input.buildNumber,
      name:        input.name,
      shortName:   input.shortName,
      hash:        input.hash,
    })
    .onConflictDoUpdate({
      target: [Patch.buildNumber],
      set:    {
        name:      input.name,
        shortName: input.shortName,
        hash:      input.hash,
      },
    });

  await fixShortNameCollisions();
}

// patch_states row marked as completed.
async function markPatchStateCompleted(buildNumber: number, importedAt: Date) {
  await db.update(PatchState)
    .set({
      importStatus:     'completed',
      importError:      null,
      projectionStatus: 'not_started',
      projectionError:  null,
      importedAt,
      projectedAt:      null,
    })
    .where(eq(PatchState.buildNumber, buildNumber));
}

// Failed patch_states state persisted.
async function upsertPatchStateFailed(input: PatchStateWriteInput, error: string) {
  await db.insert(PatchState)
    .values({
      buildNumber:      input.buildNumber,
      commit:           input.commit ?? '',
      uri:              input.uri ?? '',
      importStatus:     'failed',
      importError:      error,
      projectionStatus: 'not_started',
      projectionError:  null,
      importedAt:       null,
      projectedAt:      null,
    })
    .onConflictDoUpdate({
      target: [PatchState.buildNumber],
      set:    {
        commit:       input.commit ?? '',
        uri:          input.uri ?? '',
        importStatus: 'failed',
        importError:  error,
        importedAt:   null,
      },
    });

  // Also ensure the patch row exists.
  await db.insert(Patch)
    .values({
      buildNumber: input.buildNumber,
      name:        input.name,
      shortName:   input.shortName,
      hash:        input.hash,
    })
    .onConflictDoUpdate({
      target: [Patch.buildNumber],
      set:    {
        name:      input.name,
        shortName: input.shortName,
        hash:      input.hash,
      },
    });

  await fixShortNameCollisions();
}

// Patch state marked as failed unless the same completed import already exists.
async function markPatchStateFailedIfNeeded(
  input: PatchStateWriteInput,
  patchState: PatchStateRow | null,
  patch: PatchRow | null,
  error: string,
) {
  if (patchState?.importStatus === 'completed' && patch?.hash === input.hash) {
    return;
  }

  await upsertPatchStateFailed(input, error);
}

// Skip decision for an identical completed source.
function shouldSkipPatchStateImport(
  patchState: PatchStateRow | null,
  patch: PatchRow | null,
  hash: string,
  force: boolean,
): boolean {
  if (force) {
    return false;
  }

  return patchState?.importStatus === 'completed' && patch?.hash === hash;
}

// Extracts a compact PostgreSQL error summary without relying on driver-specific classes.
function describeDbErrorCause(error: unknown) {
  const root = findInnermostError(error);

  if (root == null || typeof root !== 'object') {
    return null;
  }

  const cause = 'cause' in root ? (root as { cause?: unknown }).cause : undefined;
  if (cause == null || typeof cause !== 'object') {
    return null;
  }

  const dbCause = cause as DbErrorCause;
  return {
    code:       dbCause.code ?? null,
    detail:     dbCause.detail ?? null,
    hint:       dbCause.hint ?? null,
    constraint: dbCause.constraint ?? null,
    table:      dbCause.table ?? null,
    column:     dbCause.column ?? null,
    position:   dbCause.position ?? null,
  };
}

// Reduces one wrapped database error into the fields worth logging during import failures.
function summarizeImportError(error: unknown) {
  const dbError = describeDbErrorCause(error);
  const cause = error != null && typeof error === 'object' && 'cause' in error
    ? (error as { cause?: unknown }).cause
    : undefined;
  const causeMessage = cause != null
    && typeof cause === 'object'
    && 'message' in cause
    && typeof (cause as { message?: unknown }).message === 'string'
    ? (cause as { message: string }).message
    : null;
  const message = error instanceof Error
    ? (error.message.startsWith('Failed query:')
      ? causeMessage ?? 'Database query failed'
      : error.message)
    : String(error);

  return {
    name: error instanceof Error ? error.name : typeof error,
    message,
    causeMessage,
    dbError,
  };
}

// buildNumber overwrite rules enforced before import begins.
function assertPatchStateImportable(
  patch: PatchRow | null,
  buildNumber: number,
  hash: string,
  force: boolean,
) {
  if (force || !patch) {
    return;
  }

  if (patch.hash !== '' && patch.hash !== hash) {
    throw new Error(`buildNumber ${buildNumber} already exists with a different hash; rerun with force=true to overwrite`);
  }
}

// Parsed raw import applied inside one transaction.
async function applyHsdataImport(
  tx: DbTx,
  input: {
    parsed:      ParsedHsdata;
    sourceTag:   number;
    dryRun:      boolean;
    force:       boolean;
    onProgress?: ImportParsedHsdataInput['onProgress'];
  },
): Promise<Omit<ImportHsdataReport, 'buildNumber' | 'dryRun' | 'skipped' | 'hash'>> {
  const allTags = input.parsed.entities.flatMap(entity => entity.tags);

  // Build a cardId→dbfId map from the XML entities. Legacy entities without
  // an ID attribute get dbfId=0 from the parser; try to resolve those from
  // previously imported snapshots in the database.
  const legacyCardIds = input.parsed.entities
    .filter(e => e.dbfId === 0)
    .map(e => e.cardId)
    .filter(Boolean);

  const dbDbfIdByCardId = legacyCardIds.length > 0
    ? await tx
      .select({ cardId: RawEntitySnapshot.cardId, dbfId: RawEntitySnapshot.dbfId })
      .from(RawEntitySnapshot)
      .where(inArray(RawEntitySnapshot.cardId, legacyCardIds))
    : [];

  const legacyDbfIdByCardId = new Map<string, number>(
    dbDbfIdByCardId
      .filter(row => row.dbfId > 0)
      .map(row => [row.cardId, row.dbfId]),
  );

  for (const entity of input.parsed.entities) {
    if (entity.dbfId === 0) {
      entity.dbfId = legacyDbfIdByCardId.get(entity.cardId) ?? 0;
    }
  }

  const { discovered, updated } = await importDiscoveredTags(
    tx,
    input.sourceTag,
    allTags,
    {
      syncStatus:     'pending_push',
      editorRuntime:  'system',
      editorIdentity: readEditorIdentity(),
      editorSource:   'hsdata',
      conflictTarget: { processingSide: 'local', processingStage: 'apply' },
      dryRun:         input.dryRun,
    },
  );

  const fallbackTagRowCount = input.parsed.entities.reduce((count, entity) => {
    return count + entity.tags.filter(tag => {
      const resolved = resolveTagValue(tag);
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
    const insertBatchSize = computeInsertBatchSize(rawEntitySnapshotInsertColumnCount);

    for (const chunk of chunkValues(newEntities, insertBatchSize)) {
      let inserted: Array<{ id: string, cardId: string, snapshotHash: string }>;

      try {
        inserted = await tx.insert(RawEntitySnapshot)
          .values(chunk.map(entity => ({
            cardId:           entity.cardId,
            dbfId:            entity.dbfId,
            sourceTags:       [input.sourceTag],
            entityXmlVersion: entity.entityXmlVersion,
            snapshotHash:     entity.snapshotHash,
            extraPayload:     entity.extraPayload,
          })))
          .returning({
            id:           RawEntitySnapshot.id,
            cardId:       RawEntitySnapshot.cardId,
            snapshotHash: RawEntitySnapshot.snapshotHash,
          });
      } catch (error) {
        throw withImportBatchError(
          error,
          'insert_raw_entity_snapshots',
          chunk.length,
          rawEntitySnapshotInsertColumnCount,
        );
      }

      for (const row of inserted) {
        const key = snapshotKey(row.cardId, row.snapshotHash);
        newSnapshotIds.set(key, row.id);
        snapshotIdByKey.set(key, row.id);
      }
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
    + ((input.force && uniqueTargetSnapshotIds.length > 0) || (!input.force && sourceTagUpdates.length > 0) ? 1 : 0);
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
        .set({ sourceTags: nextSourceTags })
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

    if (input.force) {
      await deleteSnapshotTags(tx, uniqueTargetSnapshotIds);
      completedWriteWorkCount += 1;
    }

    for (const [index, entity] of tagEntities.entries()) {
      const snapshotId = snapshotIdByKey.get(snapshotKey(entity.cardId, entity.snapshotHash))!;
      insertedTagRows += await insertSnapshotTags(tx, snapshotId, entity.tags);
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

    if (input.force && uniqueTargetSnapshotIds.length > 0) {
      await tx.update(RawEntitySnapshot)
        .set({ projectionState: 'not_projected' })
        .where(inArray(RawEntitySnapshot.id, uniqueTargetSnapshotIds));
    } else if (sourceTagUpdates.length > 0) {
      await tx.update(RawEntitySnapshot)
        .set({ projectionState: 'version_only' })
        .where(and(
          inArray(RawEntitySnapshot.id, sourceTagUpdates.map(u => u.id)),
          eq(RawEntitySnapshot.projectionState, 'projected'),
        ));
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
    discoveredTags:        discovered,
  };
}

// Parsed hsdata payload imported through the shared raw archive path.
export async function importParsedHsdata(input: ImportParsedHsdataInput): Promise<ImportHsdataReport> {
  const dryRun = input.dryRun ?? false;
  const force = input.force ?? false;
  const shortName = computeShortName(input.name, input.buildNumber);
  const patchInput: PatchStateWriteInput = {
    buildNumber: input.buildNumber,
    hash:        input.hash,
    name:        input.name,
    shortName,
    commit:      input.commit,
    uri:         input.uri,
  };
  const profiler = createHsdataProfiler('raw', {
    sourceTag:   input.buildNumber,
    build:       input.parsed.build,
    dryRun,
    force,
    entityCount: input.parsed.entities.length,
  });
  const patchState = await getPatchState(input.buildNumber);
  const patch = await getPatchRow(input.buildNumber);
  profiler.mark('load_source_version');

  if (input.patchOnly) {
    if (!dryRun) {
      // Always upsert the patch row.
      await db.insert(Patch)
        .values({
          buildNumber: input.buildNumber,
          name:        input.name,
          shortName,
          hash:        input.hash,
        })
        .onConflictDoUpdate({
          target: [Patch.buildNumber],
          set:    {
            name:      input.name,
            shortName,
            hash:      input.hash,
          },
        });

      await fixShortNameCollisions();

      // Only create/update patch_states if it doesn't already have a completed import.
      if (!patchState || patchState.importStatus !== 'completed') {
        await db.insert(PatchState)
          .values({
            buildNumber:      input.buildNumber,
            commit:           input.commit ?? '',
            uri:              input.uri ?? '',
            importStatus:     'completed',
            importError:      null,
            projectionStatus: 'not_started',
            projectionError:  null,
            importedAt:       new Date(),
            projectedAt:      null,
          })
          .onConflictDoUpdate({
            target: [PatchState.buildNumber],
            set:    {
              commit:       input.commit ?? '',
              uri:          input.uri ?? '',
              importStatus: 'completed',
              importError:  null,
              importedAt:   new Date(),
            },
          });
      }
    }
    profiler.done({ outcome: 'completed' });
    return {
      dryRun,
      skipped:               false,
      buildNumber:           input.buildNumber,
      hash:                  input.hash,
      entityCount:           0,
      insertedSnapshots:     0,
      reusedSnapshots:       0,
      insertedTagRows:       0,
      discoveredTagCount:    0,
      updatedDiscoveredTags: 0,
      fallbackTagRowCount:   0,
      discoveredTags:        [],
    };
  }

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
      await markPatchStateFailedIfNeeded(patchInput, patchState, patch, 'missing set rows');
    }

    const action = insertedPlaceholderSetCount > 0
      ? `Inserted ${insertedPlaceholderSetCount} placeholder set row(s)`
      : 'Placeholder set row(s) already exist';

    throw new Error(
      `[hearthstone][hsdata-import] missing set rows for dbfId(s): ${missingSetDbfIds.join(', ')}. ${action}. Complete set modeling before retrying import.`,
    );
  }

  if (shouldSkipPatchStateImport(patchState, patch, input.hash, force)) {
    profiler.mark('skip_existing_source');
    profiler.done({ outcome: 'skipped' });

    return {
      dryRun,
      skipped:               true,
      buildNumber:           input.buildNumber,
      hash:                  input.hash,
      entityCount:           input.parsed.entities.length,
      insertedSnapshots:     0,
      reusedSnapshots:       0,
      insertedTagRows:       0,
      discoveredTagCount:    0,
      updatedDiscoveredTags: 0,
      fallbackTagRowCount:   0,
      discoveredTags:        [],
    };
  }

  assertPatchStateImportable(patch, input.buildNumber, input.hash, force);

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
    await upsertPatchStateProcessing(patchInput);
    profiler.mark('mark_processing');
  }

  try {
    return await db.transaction(async tx => {
      const applied = await applyHsdataImport(tx, {
        parsed:     input.parsed,
        sourceTag:  input.buildNumber,
        dryRun,
        force,
        onProgress: input.onProgress,
      });

      return {
        dryRun,
        skipped:     false,
        buildNumber: input.buildNumber,
        hash:        input.hash,
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
        await markPatchStateCompleted(input.buildNumber, new Date());
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
      await markPatchStateFailedIfNeeded(patchInput, patchState, patch, error instanceof Error ? error.message : String(error));
    }

    console.error('[hearthstone][hsdata-import] failed', {
      buildNumber: input.buildNumber,
      build:       input.parsed.build,
      error:       summarizeImportError(error),
    });

    profiler.mark('failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    profiler.done({ outcome: 'failed' });

    throw error;
  }
}
