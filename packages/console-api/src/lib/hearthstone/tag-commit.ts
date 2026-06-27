import { createHash } from 'node:crypto';

import { ORPCError } from '@orpc/server';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import {
  FieldCommit,
  FieldConflict,
  FieldWinner,
  Tag,
} from '@tcg-cards/db/schema/shared/hearthstone';

/** Transaction type used by shared tag commit application helpers. */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Tag rows loaded from the shared main table. */
export type TagRow = typeof Tag.$inferSelect;

/** Commit rows persisted in shared field history. */
export type FieldCommitRow = typeof FieldCommit.$inferSelect;

/** Commit inserts accepted by shared tag apply logic. */
export type FieldCommitInsert = typeof FieldCommit.$inferInsert;

/** Active winner rows loaded during tag commit application. */
export type FieldWinnerRow = typeof FieldWinner.$inferSelect;

/** Conflict rows persisted when one incoming tag commit cannot be applied. */
type FieldConflictInsert = typeof FieldConflict.$inferInsert;

/** Editable tag fields projected through the shared field-commit pipeline. */
export type TagWrite = {
  slug: string;
  slugAliases: string[];
  name: string | null;
  rawName: string | null;
  rawType: string | null;
  rawNames: string[];
  valueKind: string;
  normalizeKind: string;
  normalizeConfig: Record<string, unknown>;
  projectTargetType: string | null;
  projectTargetPath: string | null;
  projectKind: string | null;
  projectConfig: Record<string, unknown>;
  status: string;
  description: string | null;
};

/** Apply outcomes returned after one incoming tag commit is processed. */
export type ApplyTagCommitResult = {
  status: 'applied' | 'duplicate' | 'accepted_without_projection';
  row: TagRow;
  commit: FieldCommitRow;
};

/** Conflict context emitted when one incoming tag commit cannot be merged. */
export type ApplyTagCommitConflictInput = {
  commit: FieldCommitInsert;
  current: TagRow;
  winner: FieldWinnerRow | undefined;
  processingSide: 'local' | 'remote';
  processingStage: 'apply' | 'replay';
  reason: string;
};

/** Optional hooks that customize conflict persistence for one apply attempt. */
export type ApplyTagCommitOptions = {
  conflictTarget?: {
    processingSide: 'local' | 'remote';
    processingStage: 'apply' | 'replay';
  };
  onConflict?: (tx: DbTx, input: ApplyTagCommitConflictInput) => Promise<void>;
};

const editableFields: Array<keyof TagWrite> = [
  'slug',
  'slugAliases',
  'name',
  'rawName',
  'rawType',
  'rawNames',
  'valueKind',
  'normalizeKind',
  'normalizeConfig',
  'projectTargetType',
  'projectTargetPath',
  'projectKind',
  'projectConfig',
  'status',
  'description',
];

const autoBaseFields = new Set<keyof TagWrite>([
  'rawName',
  'rawType',
  'rawNames',
  'valueKind',
]);

const supportedCommitKinds = new Set<FieldCommitInsert['commitKind']>([
  'source_edit',
  'conflict_resolution',
  'winner_clear',
  'row_create',
]);

/** Serializes JSON-compatible values with stable key ordering for revision hashing. */
function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/** Hashes one logical payload into a stable revision string. */
function hashRevision(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value), 'utf8').digest('hex')}`;
}

/** Extracts the editable shared write shape from one tag row. */
function rowToTagWrite(row: TagRow): TagWrite {
  return {
    slug:              row.slug,
    slugAliases:       row.slugAliases,
    name:              row.name,
    rawName:           row.rawName,
    rawType:           row.rawType,
    rawNames:          row.rawNames,
    valueKind:         row.valueKind,
    normalizeKind:     row.normalizeKind,
    normalizeConfig:   row.normalizeConfig,
    projectTargetType: row.projectTargetType,
    projectTargetPath: row.projectTargetPath,
    projectKind:       row.projectKind,
    projectConfig:     row.projectConfig,
    status:            row.status,
    description:       row.description,
  };
}

/** Builds the structured object key used by tag field-sync rows. */
export function toTagEntityKey(enumId: number) {
  return { enumId };
}

/** Renders one tag field path inside the shared field-sync namespace. */
export function toTagFieldPath(field: keyof TagWrite) {
  return `tag.${field}`;
}

/** Builds one deterministic row revision from the current effective tag row. */
export function buildTagRowRevision(row: TagRow) {
  return hashRevision({
    enumId:             row.enumId,
    slug:               row.slug,
    slugAliases:        row.slugAliases,
    name:               row.name,
    rawName:            row.rawName,
    rawType:            row.rawType,
    rawNames:           row.rawNames,
    valueKind:          row.valueKind,
    normalizeKind:      row.normalizeKind,
    normalizeConfig:    row.normalizeConfig,
    projectTargetType:  row.projectTargetType,
    projectTargetPath:  row.projectTargetPath,
    projectKind:        row.projectKind,
    projectConfig:      row.projectConfig,
    status:             row.status,
    description:        row.description,
    firstSeenSourceTag: row.firstSeenSourceTag,
    lastSeenSourceTag:  row.lastSeenSourceTag,
  });
}

/** Builds one deterministic winner revision from the currently active winner row. */
export function buildWinnerRevision(row: FieldWinnerRow | undefined) {
  if (!row) {
    return null;
  }

  return hashRevision({
    entityType:    row.entityType,
    entityKey:     row.entityKey,
    fieldPath:     row.fieldPath,
    winnerValue:   row.winnerValue,
    winnerSource:  row.winnerSource,
    status:        row.status,
    sourceRuntime: row.sourceRuntime,
    updatedBy:     row.updatedBy,
    baseRevision:  row.baseRevision,
    clearedAt:     row.clearedAt,
  });
}

/** Builds the fallback base revision for fields without an existing winner context. */
export function buildFallbackBaseRevision(row: TagRow, field: keyof TagWrite) {
  const fieldPath = toTagFieldPath(field);

  if (autoBaseFields.has(field)) {
    return hashRevision({
      entityType:            'tag',
      entityKey:             toTagEntityKey(row.enumId),
      fieldPath,
      resolvedBaseValue:     rowToTagWrite(row)[field],
      resolvedSource:        'auto:hsdata',
      resolutionMode:        'rule_auto',
      resolutionFingerprint: 'hearthstone-tag-hsdata-discovery:v1',
    });
  }

  return hashRevision({
    entityType:            'tag',
    entityKey:             toTagEntityKey(row.enumId),
    fieldPath,
    resolvedBaseValue:     null,
    resolvedSource:        'base:none',
    resolutionMode:        'manual_only',
    resolutionFingerprint: 'hearthstone-tag-manual-only:v1',
  });
}

/** Resolves one editable tag field from its shared field path. */
function fieldFromPath(fieldPath: string): keyof TagWrite {
  const field = fieldPath.replace(/^tag\./, '') as keyof TagWrite;

  if (!editableFields.includes(field)) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Unsupported tag fieldPath: ${fieldPath}`,
    });
  }

  return field;
}

/** Reads the tag enum id from one structured tag entity key. */
function enumIdFromEntityKey(entityKey: unknown) {
  if (typeof entityKey !== 'object' || entityKey == null || Array.isArray(entityKey)) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Tag commit entityKey must be an object with enumId',
    });
  }

  const enumId = (entityKey as Record<string, unknown>).enumId;
  if (typeof enumId !== 'number' || !Number.isInteger(enumId)) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Tag commit entityKey.enumId must be an integer',
    });
  }

  return enumId;
}

/** Builds the next projected tag row after one single-field commit is accepted. */
function nextTagWrite(row: TagRow, field: keyof TagWrite, value: unknown): TagWrite {
  return {
    ...rowToTagWrite(row),
    [field]: value as TagWrite[typeof field],
  };
}

/** Decides whether one commit can participate in main-table projection immediately. */
function canProjectCommit(commit: Pick<FieldCommitInsert, 'reviewStatus'>) {
  return commit.reviewStatus === 'auto_approved' || commit.reviewStatus === 'approved';
}

/** Derives the winner source label for current tag manual edit commits. */
function toWinnerSource(
  commit: Pick<FieldCommitInsert, 'commitKind' | 'editorRuntime'>,
  field: keyof TagWrite,
) {
  if (commit.commitKind === 'winner_clear' && autoBaseFields.has(field)) {
    return 'auto:hsdata';
  }

  if (commit.commitKind === 'source_edit') {
    return `manual:${commit.editorRuntime}`;
  }

  return `${commit.commitKind}:${commit.editorRuntime}`;
}

/** Persists one unified field conflict discovered while applying an incoming tag commit. */
async function insertConflict(
  tx: DbTx,
  input: ApplyTagCommitConflictInput,
) {
  await tx.insert(FieldConflict).values({
    processingSide:  input.processingSide,
    processingStage: input.processingStage,
    conflictKind:    input.reason,
    entityType:      'tag',
    entityKey:       input.commit.entityKey,
    fieldPath:       input.commit.fieldPath,
    sourceSummary:      {
      clientMutationId: input.commit.clientMutationId,
      commitKind:       input.commit.commitKind,
      operation:        input.commit.operation,
      editorRuntime:    input.commit.editorRuntime,
    },
    candidateBaseValue: null,
    localValue:         rowToTagWrite(input.current)[fieldFromPath(input.commit.fieldPath)],
    incomingValue:      input.commit.value,
    effectiveValue:     rowToTagWrite(input.current)[fieldFromPath(input.commit.fieldPath)],
    winnerValue:        input.winner?.winnerValue,
    baseRevision:       input.commit.baseRevision,
    status:             'open',
    reason:             input.reason,
    resolution:         null,
    resolvedAt:         null,
  } satisfies FieldConflictInsert);
}

const rowCreateFields: Array<keyof TagWrite> = [
  'slug', 'name', 'rawName', 'rawType', 'rawNames', 'valueKind',
  'normalizeKind', 'status',
];

/** Creates a tag row and field_winners from a row_create commit on the target DB.
 *
 * Used when push-to-remote replays a row_create on a DB that doesn't have the row yet.
 */
async function createRowFromCommit(
  tx: DbTx,
  commit: FieldCommitInsert,
  enumId: number,
  rowState: TagWrite,
): Promise<ApplyTagCommitResult> {
  const entityKey = toTagEntityKey(enumId);
  const now = new Date();

  const inserted = await tx.insert(Tag).values({
    enumId,
    slug:               rowState.slug,
    slugAliases:        rowState.slugAliases,
    name:               rowState.name,
    rawName:            rowState.rawName,
    rawType:            rowState.rawType,
    rawNames:           rowState.rawNames,
    valueKind:          rowState.valueKind,
    normalizeKind:      rowState.normalizeKind,
    normalizeConfig:    rowState.normalizeConfig,
    projectTargetType:  rowState.projectTargetType,
    projectTargetPath:  rowState.projectTargetPath,
    projectKind:        rowState.projectKind,
    projectConfig:      rowState.projectConfig,
    status:             rowState.status,
    description:        rowState.description,
    firstSeenSourceTag: null,
    lastSeenSourceTag:  null,
  }).onConflictDoNothing().returning().then(rows => rows[0]);

  // Tag may already exist on target (web-side edits or partial push). Load it.
  const tagRow = inserted ?? await tx.select()
    .from(Tag)
    .where(eq(Tag.enumId, enumId))
    .then(rows => rows[0]);

  if (!tagRow) {
    throw new ORPCError('BAD_REQUEST', { message: `Failed to create tag ${enumId} from row_create` });
  }

  // Create field_winners for auto-base fields (skip if already active)
  for (const field of rowCreateFields) {
    const fieldPath = toTagFieldPath(field);
    const value = rowState[field];

    await tx.insert(FieldWinner).values({
      entityType:    'tag',
      entityKey,
      fieldPath,
      winnerValue:   value,
      winnerSource:  'auto:hsdata',
      status:        'active',
      sourceRuntime: commit.editorRuntime,
      updatedBy:     commit.editorIdentity,
      baseRevision:  buildFallbackBaseRevision(tagRow, field),
    }).onConflictDoNothing();
  }

  const saved = await tx.insert(FieldCommit)
    .values({
      ...commit,
      projectionStatus: 'projected',
      projectedAt:      now,
    })
    .returning()
    .then(rows => rows[0]);

  if (!saved) {
    throw new ORPCError('BAD_REQUEST', { message: 'Failed to persist tag commit' });
  }

  return { status: 'applied', row: tagRow, commit: saved };
}

/** Applies one incoming tag commit with idempotency, revision checks, merge, and projection. */
export async function applyTagCommit(
  tx: DbTx,
  commit: FieldCommitInsert,
  options?: ApplyTagCommitOptions,
): Promise<ApplyTagCommitResult> {
  if (commit.entityType !== 'tag') {
    throw new ORPCError('BAD_REQUEST', {
      message: `Unsupported entityType: ${commit.entityType}`,
    });
  }

  if (!supportedCommitKinds.has(commit.commitKind)) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Unsupported tag commitKind: ${commit.commitKind}`,
    });
  }

  const duplicate = await tx.select()
    .from(FieldCommit)
    .where(eq(FieldCommit.clientMutationId, commit.clientMutationId))
    .then(rows => rows[0]);

  if (duplicate) {
    const enumId = enumIdFromEntityKey(commit.entityKey);
    const current = await tx.select()
      .from(Tag)
      .where(eq(Tag.enumId, enumId))
      .then(rows => rows[0]);

    if (!current) {
      throw new ORPCError('NOT_FOUND', { message: 'Tag not found' });
    }

    return {
      status: 'duplicate',
      row:    current,
      commit: duplicate,
    };
  }

  const enumId = enumIdFromEntityKey(commit.entityKey);
  const isRowCreate = commit.commitKind === 'row_create';
  // row_create uses 'tag' as the entity-level fieldPath; other commits must resolve a real field.
  const field = isRowCreate && commit.fieldPath === 'tag'
    ? 'slug' // dummy, not used for projection
    : fieldFromPath(commit.fieldPath);
  const current = await tx.select()
    .from(Tag)
    .where(eq(Tag.enumId, enumId))
    .then(rows => rows[0]);

  // row_create creates the row on the target DB if it doesn't exist yet (push to remote).
  if (isRowCreate && !current) {
    const rowState = commit.value as TagWrite;
    return await createRowFromCommit(tx, commit, enumId, rowState);
  }

  if (!current) {
    throw new ORPCError('NOT_FOUND', { message: 'Tag not found' });
  }

  const winner = await tx.select()
    .from(FieldWinner)
    .where(and(
      eq(FieldWinner.entityType, 'tag'),
      eq(FieldWinner.status, 'active'),
      eq(FieldWinner.entityKey, toTagEntityKey(enumId)),
      eq(FieldWinner.fieldPath, commit.fieldPath),
    ))
    .then(rows => rows[0]);

  const expectedRowRevision = buildTagRowRevision(current);
  const expectedWinnerRevision = buildWinnerRevision(winner);
  const conflictTarget = options?.conflictTarget ?? {
    processingSide:  'local',
    processingStage: 'apply',
  } satisfies ApplyTagCommitOptions['conflictTarget'];
  const onConflict = options?.onConflict ?? insertConflict;

  // row_create commits skip revision checks — they establish the initial baseline.
  if (!isRowCreate && commit.expectedRowRevision !== expectedRowRevision) {
    await onConflict(tx, {
      commit,
      current,
      winner,
      processingSide: conflictTarget.processingSide,
      processingStage: conflictTarget.processingStage,
      reason: 'expected_row_revision_mismatch',
    });

    throw new ORPCError('CONFLICT', {
      message: 'Tag row revision conflict',
    });
  }

  if (!isRowCreate && (commit.expectedWinnerRevision ?? null) !== (expectedWinnerRevision ?? null)) {
    await onConflict(tx, {
      commit,
      current,
      winner,
      processingSide: conflictTarget.processingSide,
      processingStage: conflictTarget.processingStage,
      reason: 'expected_winner_revision_mismatch',
    });

    throw new ORPCError('CONFLICT', {
      message: 'Tag winner revision conflict',
    });
  }

  const acceptedAt = new Date();

  // row_create when the row already exists: idempotent, just record the commit.
  if (isRowCreate) {
    const inserted = await tx.insert(FieldCommit)
      .values({
        ...commit,
        projectionStatus: 'skipped',
        projectedAt:      null,
      })
      .returning()
      .then(rows => rows[0]);

    if (!inserted) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Failed to persist tag commit',
      });
    }

    return {
      status: 'applied',
      row:    current,
      commit: inserted,
    };
  }

  if (!canProjectCommit(commit)) {
    const pending = await tx.insert(FieldCommit)
      .values({
        ...commit,
        projectionStatus: 'pending',
        projectedAt:      null,
      })
      .returning()
      .then(rows => rows[0]);

    if (!pending) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Failed to persist tag commit',
      });
    }

    return {
      status: 'accepted_without_projection',
      row:    current,
      commit: pending,
    };
  }

  const updated = await tx.update(Tag)
    .set(nextTagWrite(current, field, commit.value))
    .where(eq(Tag.enumId, enumId))
    .returning()
    .then(rows => rows[0]);

  if (!updated) {
    throw new ORPCError('NOT_FOUND', { message: 'Tag not found' });
  }

  if (winner) {
    await tx.update(FieldWinner)
      .set({
        entityType:    'tag',
        entityKey:     toTagEntityKey(enumId),
        fieldPath:     commit.fieldPath,
        winnerValue:   commit.value,
        winnerSource:  toWinnerSource(commit, field),
        status:        'active',
        sourceRuntime: commit.editorRuntime,
        updatedBy:     commit.editorIdentity,
        baseRevision:  commit.baseRevision,
        updatedAt:     acceptedAt,
        clearedAt:     null,
      })
      .where(eq(FieldWinner.id, winner.id));
  } else {
    await tx.insert(FieldWinner).values({
      entityType:    'tag',
      entityKey:     toTagEntityKey(enumId),
      fieldPath:     commit.fieldPath,
      winnerValue:   commit.value,
      winnerSource:  toWinnerSource(commit, field),
      status:        'active',
      sourceRuntime: commit.editorRuntime,
      updatedBy:     commit.editorIdentity,
      baseRevision:  commit.baseRevision,
      updatedAt:     acceptedAt,
      clearedAt:     null,
    });
  }

  const inserted = await tx.insert(FieldCommit)
    .values({
      ...commit,
      projectionStatus: 'projected',
      projectedAt:      acceptedAt,
    })
    .returning()
    .then(rows => rows[0]);

  if (!inserted) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Failed to persist tag commit',
    });
  }

  return {
    status: 'applied',
    row:    updated,
    commit: inserted,
  };
}

// ─── Shared tag service types ───────────────────────────────────────

import type {
  TagListInput,
  TagListResult,
  TagProfile,
  TagUpdateInput,
} from '@tcg-cards/model/src/hearthstone/schema/tag';

/** Options that control how one tag edit commit is persisted and synced. */
export interface TagServiceOptions {
  syncStatus: 'pending_push' | 'synced' | 'pulled';
  editorRuntime: string;
  editorIdentity: string;
  editorSource: string;
  conflictTarget: {
    processingSide: 'local' | 'remote';
    processingStage: 'apply' | 'replay';
  };
}

/** Serializable tag field write shape accepted by shared tag service helpers. */
type TagWriteInput = {
  slug: string;
  slugAliases: string[];
  name: string | null;
  rawName: string | null;
  rawType: string | null;
  rawNames: string[];
  valueKind: string;
  normalizeKind: string;
  normalizeConfig: Record<string, unknown>;
  projectTargetType: string | null;
  projectTargetPath: string | null;
  projectKind: string | null;
  projectConfig: Record<string, unknown>;
  status: string;
  description: string | null;
};

const projectKindSet = new Set([
  'assign_value',
  'append_string_array',
  'assign_card_ref',
  'assign_localized_text',
  'assign_mechanic',
  'assign_referenced_tag',
  'assign_legacy',
  'emit_relation',
]);

const projectTargetTypeSet = new Set([
  'entity',
  'entity_localization',
  'entity_relation',
]);

const enumMapAliasSet = new Set([
  'set',
  'rarity',
  'multiclass',
  'spell-school',
  'race',
]);

/** Stable JSON serialization for revision hashing. */
function stableJson(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableJson(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}

/** Trims one nullable string to a non-empty value or null. */
function trimToNull(value: string | null | undefined) {
  const text = value?.trim();
  return text && text.length > 0 ? text : null;
}

/** Deduplicates and trims one array of strings to non-empty unique values. */
function uniqueTrimmed(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

/** Maps one persisted tag row into the public tag profile shape. */
export function toTagProfile(row: TagRow): TagProfile {
  return {
    enumId:             row.enumId,
    slug:               row.slug,
    slugAliases:        row.slugAliases,
    name:               row.name,
    rawName:            row.rawName,
    rawType:            row.rawType,
    rawNames:           row.rawNames,
    valueKind:          row.valueKind,
    normalizeKind:      row.normalizeKind,
    normalizeConfig:    row.normalizeConfig,
    projectTargetType:  row.projectTargetType,
    projectTargetPath:  row.projectTargetPath,
    projectKind:        row.projectKind,
    projectConfig:      row.projectConfig,
    status:             row.status,
    description:        row.description,
    firstSeenSourceTag: row.firstSeenSourceTag,
    lastSeenSourceTag:  row.lastSeenSourceTag,
    createdAt:          row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    updatedAt:          row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
  };
}

/** Filters one tag profile against list input search criteria. */
export function matchesTagSearch(tag: TagProfile, input: TagListInput) {
  const status = input.status?.trim();
  if (status && tag.status !== status) {
    return false;
  }

  const projectKind = input.projectKind?.trim();
  if (projectKind && tag.projectKind !== projectKind) {
    return false;
  }

  const q = input.q?.trim().toLowerCase();
  if (!q) {
    return true;
  }

  const values = [
    String(tag.enumId),
    tag.slug,
    tag.name,
    tag.rawName,
    tag.rawType,
    tag.valueKind,
    tag.normalizeKind,
    tag.projectTargetType,
    tag.projectTargetPath,
    tag.projectKind,
    tag.status,
    tag.description,
    ...tag.slugAliases,
    ...tag.rawNames,
  ];

  return values.some(value => value?.toLowerCase().includes(q));
}

/** Lists tag configurations with pagination and filtering. */
export async function listTags(
  db: DbTx,
  input: TagListInput,
): Promise<TagListResult> {
  const rows = await db.select()
    .from(Tag)
    .orderBy(asc(Tag.enumId));

  const profiles = rows.map(toTagProfile).filter(tag => matchesTagSearch(tag, input));
  const offset = (input.page - 1) * input.limit;

  return {
    items: profiles.slice(offset, offset + input.limit),
    total: profiles.length,
    page:  input.page,
    limit: input.limit,
  };
}

/** Reads one tag by enum id. */
export async function getTag(
  db: DbTx,
  enumId: number,
): Promise<TagProfile> {
  const row = await db.select()
    .from(Tag)
    .where(eq(Tag.enumId, enumId))
    .then(rows => rows[0]);

  if (!row) {
    throw new ORPCError('NOT_FOUND', { message: 'Tag not found' });
  }

  return toTagProfile(row);
}

/** Normalizes one incoming tag update payload into the write shape. */
export function normalizeTagWrite(input: TagUpdateInput): TagWrite {
  return {
    slug:              input.slug.trim(),
    slugAliases:       uniqueTrimmed(input.slugAliases),
    name:              trimToNull(input.name),
    rawName:           trimToNull(input.rawName),
    rawType:           trimToNull(input.rawType),
    rawNames:          uniqueTrimmed(input.rawNames),
    valueKind:         input.valueKind.trim(),
    normalizeKind:     input.normalizeKind.trim(),
    normalizeConfig:   input.normalizeConfig,
    projectTargetType: trimToNull(input.projectTargetType),
    projectTargetPath: trimToNull(input.projectTargetPath),
    projectKind:       trimToNull(input.projectKind),
    projectConfig:     input.projectConfig,
    status:            input.status.trim(),
    description:       trimToNull(input.description),
  };
}

/** Validates one tag update payload against supported business rules. */
export function assertTagUpdate(input: TagUpdateInput) {
  if (input.valueKind === 'enum') {
    throw new ORPCError('BAD_REQUEST', {
      message: 'valueKind=enum is no longer supported; use int + enum_from_int instead',
    });
  }

  if (input.projectTargetPath === 'text' || input.projectTargetPath === 'displayText') {
    throw new ORPCError('BAD_REQUEST', {
      message: 'text and displayText are derived fields; use richText as the projection target',
    });
  }

  if (input.normalizeKind === 'enum_from_int') {
    const enumMap = input.normalizeConfig.enumMap;

    if (typeof enumMap === 'string' && !enumMapAliasSet.has(enumMap)) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'normalizeConfig.enumMap only supports the string aliases "set", "rarity", "multiclass", "spell-school", and "race"',
      });
    }

    if (enumMap != null && typeof enumMap !== 'string' && (typeof enumMap !== 'object' || Array.isArray(enumMap))) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'normalizeConfig.enumMap must be an object or one of the supported string aliases',
      });
    }
  }

  if (input.projectKind != null && !projectKindSet.has(input.projectKind)) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Unsupported projectKind: ${input.projectKind}`,
    });
  }

  if (input.projectTargetType != null && !projectTargetTypeSet.has(input.projectTargetType)) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Unsupported projectTargetType: ${input.projectTargetType}`,
    });
  }

  if (input.projectKind === 'assign_localized_text' && input.projectTargetType !== 'entity_localization') {
    throw new ORPCError('BAD_REQUEST', {
      message: 'assign_localized_text requires projectTargetType=entity_localization',
    });
  }

  if (input.projectKind === 'emit_relation' && input.projectTargetType !== 'entity_relation') {
    throw new ORPCError('BAD_REQUEST', {
      message: 'emit_relation requires projectTargetType=entity_relation',
    });
  }
}

/** Compares the current row with the incoming write and returns changed fields with winners. */
function collectTagDiffsShared(current: TagRow, next: TagWrite, winners: FieldWinnerRow[]) {
  const currentWrite = rowToTagWrite(current);
  const winnerByField = new Map(winners.map(winner => [winner.fieldPath, winner]));

  return editableFields
    .filter(field => stableJson(currentWrite[field]) !== stableJson(next[field]))
    .map(field => {
      const fieldPath = toTagFieldPath(field);

      return {
        field,
        fieldPath,
        value: next[field],
        previousWinner: winnerByField.get(fieldPath),
      };
    });
}

/** Builds one idempotency key for a tag field edit. */
export function buildClientMutationId(enumId: number, fieldPath: string) {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : createHash('sha256')
      .update(`${enumId}:${fieldPath}:${Date.now()}:${Math.random()}`, 'utf8')
      .digest('hex');

  return `tag:${enumId}:${fieldPath}:${random}`;
}

/** Saves one manual tag edit via the field-commit workflow inside a single transaction. */
export async function saveTagEdit(
  db: DbTx,
  input: TagUpdateInput,
  options: TagServiceOptions,
): Promise<TagProfile> {
  assertTagUpdate(input);

  const current = await db.select()
    .from(Tag)
    .where(eq(Tag.enumId, input.enumId))
    .then(rows => rows[0]);

  if (!current) {
    throw new ORPCError('NOT_FOUND', { message: 'Tag not found' });
  }

  const next = normalizeTagWrite(input);
  const fieldPaths = editableFields.map(toTagFieldPath);
  const entityKey = toTagEntityKey(input.enumId);
  const existingWinners = await db.select()
    .from(FieldWinner)
    .where(and(
      eq(FieldWinner.entityType, 'tag'),
      eq(FieldWinner.status, 'active'),
      eq(FieldWinner.entityKey, entityKey),
      inArray(FieldWinner.fieldPath, fieldPaths),
    ));

  const diffs = collectTagDiffsShared(current, next, existingWinners);

  if (diffs.length === 0) {
    return toTagProfile(current);
  }

  let currentRow = current;

  for (const diff of diffs) {
    const commit = {
      entityType:             'tag',
      entityKey,
      fieldPath:              diff.fieldPath,
      value:                  diff.value,
      operation:              'set',
      commitKind:             'source_edit',
      clientMutationId:       buildClientMutationId(input.enumId, diff.fieldPath),
      editorRuntime:          options.editorRuntime,
      editorIdentity:         options.editorIdentity,
      editorSource:           options.editorSource,
      expectedRowRevision:    buildTagRowRevision(currentRow),
      expectedWinnerRevision: buildWinnerRevision(diff.previousWinner),
      baseRevision:           diff.previousWinner?.baseRevision ?? buildFallbackBaseRevision(currentRow, diff.field),
      reviewStatus:           'auto_approved',
      reviewedBy:             null,
      reviewedAt:             null,
      reviewReason:           null,
      projectionStatus:       'pending',
      syncStatus:             options.syncStatus,
      createdAt:              new Date(),
      projectedAt:            null,
    } satisfies FieldCommitInsert;

    const applied = await applyTagCommit(db, commit, {
      conflictTarget: options.conflictTarget,
    });
    currentRow = applied.row;
  }

  return toTagProfile(currentRow);
}

// ─── Auto-import tag discovery helpers ──────────────────────────────

/** One raw tag discovered during hsdata import. */
export interface DiscoveredTagInput {
  enumId: number;
  rawName: string | null;
  rawType: string | null;
}

/** Snapshot of an existing tag before import discovery writes. */
export interface ExistingTagSnapshot {
  enumId: number;
  slug: string;
  rawName: string | null;
  rawType: string | null;
  rawNames: string[];
  valueKind: string;
  normalizeKind: string;
  projectTargetType: string | null;
  projectTargetPath: string | null;
  projectKind: string | null;
  firstSeenSourceTag: number | null;
  lastSeenSourceTag: number | null;
}

/** Guesses the best tag value kind from raw input and an existing row. */
function guessValueKind(raw: DiscoveredTagInput, existing: ExistingTagSnapshot | undefined) {
  if (existing?.valueKind !== 'json' && existing?.valueKind != null) return existing.valueKind;
  if (raw.rawType === 'Bool') return 'bool';
  if (raw.rawType === 'Int') return 'int';
  if (raw.rawType === 'String' || raw.rawType === 'LocString') return 'string';
  return 'json';
}

/** Slugifies one raw tag name into a stable identifier, avoiding duplicates. */
function slugify(rawName: string | null, enumId: number, conflicts: ReadonlySet<string>) {
  const base = (rawName?.trim() || `tag_${enumId}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  if (!conflicts.has(base)) {
    return base;
  }

  return `${base}_${enumId}`;
}

/** Builds one row_create commit representing the entire initial row state. */
function buildRowCreateCommit(
  enumId: number,
  row: TagRow,
  options: TagServiceOptions,
): FieldCommitInsert {
  return {
    entityType:             'tag',
    entityKey:              toTagEntityKey(enumId),
    fieldPath:              'tag',
    value:                  rowToTagWrite(row),
    operation:              'set',
    commitKind:             'row_create',
    clientMutationId:       buildClientMutationId(enumId, `tag:row_create:${Date.now()}`),
    editorRuntime:          options.editorRuntime,
    editorIdentity:         options.editorIdentity,
    editorSource:           options.editorSource,
    expectedRowRevision:    '',
    expectedWinnerRevision: null,
    baseRevision:           hashRevision({
      entityType:            'tag',
      entityKey:             toTagEntityKey(enumId),
      fieldPath:             'tag',
      resolvedBaseValue:     rowToTagWrite(row),
      resolvedSource:        'auto:hsdata',
      resolutionMode:        'rule_auto',
      resolutionFingerprint: 'hearthstone-tag-hsdata-discovery:v1',
    }),
    reviewStatus:       'auto_approved',
    reviewedBy:         null,
    reviewedAt:         null,
    reviewReason:       null,
    projectionStatus:   'pending',
    syncStatus:         options.syncStatus,
    createdAt:          new Date(),
    projectedAt:        null,
  };
}

/** Upserts discovered tags with field-commit workflow during hsdata import.
 *
 * - New tags: INSERT the row, then create row_create commits + winners for each field.
 * - Existing tags: create source_edit commits for changed discovery metadata fields.
 * - When dryRun is true, only reads and counts without any writes.
 */
export async function importDiscoveredTags(
  tx: DbTx,
  sourceTag: number,
  tags: DiscoveredTagInput[],
  options: TagServiceOptions & { dryRun?: boolean },
): Promise<{ existing: Map<number, ExistingTagSnapshot>; discovered: number[]; updated: number }> {
  const dryRun = options.dryRun ?? false;
  const enumIds = [...new Set(tags.map(tag => tag.enumId))].sort((a, b) => a - b);
  const existingRows = await tx.select()
    .from(Tag)
    .where(inArray(Tag.enumId, enumIds));
  const existing = new Map(existingRows.map(row => [row.enumId, row as ExistingTagSnapshot]));
  const discovered: number[] = [];
  let updated = 0;

  const slugConflicts = new Set(existingRows.map(row => row.slug));

  const firstSeenByEnum = new Map<number, DiscoveredTagInput>();
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
      const slug = slugify(input.rawName, enumId, slugConflicts);
      slugConflicts.add(slug);

      if (!dryRun) {
        // INSERT the tag row first
        const inserted = await tx.insert(Tag).values({
          enumId,
          slug,
          name:               input.rawName || null,
          rawName:            input.rawName || null,
          rawType:            input.rawType || null,
          rawNames:           input.rawName ? [input.rawName] : [],
          valueKind:          guessedKind,
          normalizeKind:      'identity_int',
          normalizeConfig:    {},
          projectTargetType:  'entity',
          projectTargetPath:  'mechanics',
          projectKind:        'assign_mechanic',
          projectConfig:      {},
          status:             'discovered',
          description:        null,
          firstSeenSourceTag: sourceTag,
          lastSeenSourceTag:  sourceTag,
        }).returning().then(rows => rows[0]);

        if (!inserted) {
          throw new ORPCError('BAD_REQUEST', { message: `Failed to insert discovered tag ${enumId}` });
        }

        // Create one row_create commit for the entire row
        const rowCreateCommit = buildRowCreateCommit(enumId, (inserted as TagRow), options);
        await applyTagCommit(tx, rowCreateCommit, {
          conflictTarget: options.conflictTarget,
        });

        // Create field_winners for auto-base fields
        const autoFields: Array<keyof TagWrite> = [
          'slug', 'name', 'rawName', 'rawType', 'rawNames', 'valueKind',
          'normalizeKind', 'status',
        ];

        for (const field of autoFields) {
          const fieldPath = toTagFieldPath(field);
          await tx.insert(FieldWinner).values({
            entityType:    'tag',
            entityKey:     toTagEntityKey(enumId),
            fieldPath,
            winnerValue:   (inserted as TagRow)[field],
            winnerSource:  'auto:hsdata',
            status:        'active',
            sourceRuntime: options.editorRuntime,
            updatedBy:     options.editorIdentity,
            baseRevision:  buildFallbackBaseRevision(inserted as TagRow, field),
          });
        }
      }

      existing.set(enumId, {
        enumId,
        slug,
        rawName:            input.rawName || null,
        rawType:            input.rawType || null,
        rawNames:           input.rawName ? [input.rawName] : [],
        valueKind:          guessedKind,
        normalizeKind:      'identity_int',
        projectTargetType:  'entity',
        projectTargetPath:  'mechanics',
        projectKind:        'assign_mechanic',
        firstSeenSourceTag: sourceTag,
        lastSeenSourceTag:  sourceTag,
      });
      continue;
    }

    // Check for metadata updates on existing tag
    const nextRawNames = input.rawName && !row.rawNames.includes(input.rawName)
      ? [...row.rawNames, input.rawName].sort()
      : row.rawNames;

    const needsUpdate = nextRawNames !== row.rawNames
      || row.lastSeenSourceTag !== sourceTag
      || row.rawName == null
      || row.rawType == null;

    if (needsUpdate) {
      updated += 1;

      if (!dryRun) {
        const rawNameNext = row.rawName ?? input.rawName ?? null;
        const rawTypeNext = row.rawType ?? input.rawType ?? null;

        // rawName
        if (rawNameNext !== row.rawName) {
          try {
            await applyTagCommit(tx, fieldEditCommit(enumId, 'rawName', rawNameNext, row as unknown as TagRow, options), { conflictTarget: options.conflictTarget });
          } catch {
            await tx.update(Tag).set({ rawName: rawNameNext }).where(eq(Tag.enumId, enumId));
          }
        }

        // rawType
        if (rawTypeNext !== row.rawType) {
          try {
            await applyTagCommit(tx, fieldEditCommit(enumId, 'rawType', rawTypeNext, row as unknown as TagRow, options), { conflictTarget: options.conflictTarget });
          } catch {
            await tx.update(Tag).set({ rawType: rawTypeNext }).where(eq(Tag.enumId, enumId));
          }
        }

        // rawNames + lastSeenSourceTag (always update these)
        await tx.update(Tag)
          .set({ rawNames: nextRawNames, lastSeenSourceTag: sourceTag })
          .where(eq(Tag.enumId, enumId));
      }
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

/** Builds one source_edit commit for an auto-import field metadata update. */
function fieldEditCommit(
  enumId: number,
  field: keyof TagWrite,
  value: unknown,
  row: TagRow,
  options: TagServiceOptions,
): FieldCommitInsert {
  const fieldPath = toTagFieldPath(field);
  return {
    entityType:             'tag',
    entityKey:              toTagEntityKey(enumId),
    fieldPath,
    value,
    operation:              'set',
    commitKind:             'source_edit',
    clientMutationId:       buildClientMutationId(enumId, `${fieldPath}:import:${Date.now()}`),
    editorRuntime:          options.editorRuntime,
    editorIdentity:         options.editorIdentity,
    editorSource:           options.editorSource,
    expectedRowRevision:    buildTagRowRevision(row),
    expectedWinnerRevision: null,
    baseRevision:           hashRevision({
      entityType:            'tag',
      entityKey:             toTagEntityKey(enumId),
      fieldPath,
      resolvedBaseValue:     value,
      resolvedSource:        'auto:hsdata',
      resolutionMode:        'rule_auto',
      resolutionFingerprint: 'hearthstone-tag-hsdata-discovery:v1',
    }),
    reviewStatus:       'auto_approved',
    reviewedBy:         null,
    reviewedAt:         null,
    reviewReason:       null,
    projectionStatus:   'pending',
    syncStatus:         options.syncStatus,
    createdAt:          new Date(),
    projectedAt:        null,
  };
}
