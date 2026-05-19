import { createHash } from 'node:crypto';

import { ORPCError } from '@orpc/server';
import { and, eq } from 'drizzle-orm';

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
function toWinnerSource(commit: Pick<FieldCommitInsert, 'commitKind' | 'editorRuntime'>) {
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

  if (commit.commitKind !== 'source_edit') {
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
  const field = fieldFromPath(commit.fieldPath);
  const current = await tx.select()
    .from(Tag)
    .where(eq(Tag.enumId, enumId))
    .then(rows => rows[0]);

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

  if (commit.expectedRowRevision !== expectedRowRevision) {
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

  if ((commit.expectedWinnerRevision ?? null) !== (expectedWinnerRevision ?? null)) {
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
        winnerSource:  toWinnerSource(commit),
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
      winnerSource:  toWinnerSource(commit),
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
