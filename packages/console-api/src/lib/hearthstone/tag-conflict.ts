import { createHash } from 'node:crypto';

import { ORPCError } from '@orpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';

import { createDb, db } from '@tcg-cards/db/db';
import { FieldConflict, FieldWinner } from '@tcg-cards/db/schema/shared/hearthstone';
import { Tag } from '@tcg-cards/db/schema/shared/hearthstone/tag';
import type {
  TagConflictListInput,
  TagConflictListResult,
  TagConflictProfile,
  TagConflictResolveInput,
} from '@tcg-cards/model/src/hearthstone/schema/tag';
import {
  applyTagCommit,
  buildTagRowRevision,
  buildWinnerRevision,
  toTagEntityKey,
  type ApplyTagCommitOptions,
  type DbTx,
  type FieldCommitInsert,
  type FieldWinnerRow,
  type TagRow,
  type TagWrite,
} from './tag-commit';

/** Database handles accepted by tag conflict helpers. */
export type ConflictDb = ReturnType<typeof createDb> | typeof db;

/** Query contexts shared by top-level reads and transaction-scoped conflict resolution. */
type ConflictQuery = ConflictDb | DbTx;

/** Conflict rows loaded from the shared field-conflict table. */
type FieldConflictRow = typeof FieldConflict.$inferSelect;

/** Conflict resolution metadata forwarded into follow-up commits. */
export type ResolveTagConflictOptions = {
  editorRuntime: string;
  editorIdentity: string | null;
  syncStatus: string;
  conflictTarget?: ApplyTagCommitOptions['conflictTarget'];
};

const autoBaseFields = new Set<keyof TagWrite>([
  'rawName',
  'rawType',
  'rawNames',
  'valueKind',
]);

/** Reads the tag enum id from one structured entity key payload. */
function enumIdFromEntityKey(entityKey: unknown) {
  if (typeof entityKey !== 'object' || entityKey == null || Array.isArray(entityKey)) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Tag conflict entityKey must be an object with enumId',
    });
  }

  const enumId = (entityKey as Record<string, unknown>).enumId;
  if (typeof enumId !== 'number' || !Number.isInteger(enumId)) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Tag conflict entityKey.enumId must be an integer',
    });
  }

  return enumId;
}

/** Resolves one editable tag field from its persisted field path. */
function fieldFromPath(fieldPath: string): keyof TagWrite {
  const field = fieldPath.replace(/^tag\./, '') as keyof TagWrite;

  if (!([
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
  ] as Array<keyof TagWrite>).includes(field)) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Unsupported tag conflict fieldPath: ${fieldPath}`,
    });
  }

  return field;
}

/** Builds one client mutation id for follow-up conflict-resolution commits. */
function buildClientMutationId(conflictId: string, fieldPath: string, resolution: string) {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : createHash('sha256')
      .update(`${conflictId}:${fieldPath}:${resolution}:${Date.now()}:${Math.random()}`, 'utf8')
      .digest('hex');

  return `tag-conflict:${conflictId}:${fieldPath}:${resolution}:${random}`;
}

/** Formats one timestamp-like field as an ISO string. */
function toIsoString(value: Date | string | null) {
  if (value == null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Maps one raw field-conflict row into the public tag conflict shape. */
function toConflictProfile(row: FieldConflictRow): TagConflictProfile {
  return {
    id:                 row.id,
    processingSide:     row.processingSide,
    processingStage:    row.processingStage,
    conflictKind:       row.conflictKind,
    enumId:             enumIdFromEntityKey(row.entityKey),
    fieldPath:          row.fieldPath,
    sourceSummary:      row.sourceSummary,
    candidateBaseValue: row.candidateBaseValue ?? null,
    localValue:         row.localValue ?? null,
    incomingValue:      row.incomingValue ?? null,
    effectiveValue:     row.effectiveValue ?? null,
    winnerValue:        row.winnerValue ?? null,
    baseRevision:       row.baseRevision,
    status:             row.status as TagConflictProfile['status'],
    reason:             row.reason ?? null,
    resolution:         (row.resolution as TagConflictProfile['resolution']) ?? null,
    createdAt:          toIsoString(row.createdAt)!,
    resolvedAt:         toIsoString(row.resolvedAt),
  };
}

/** Loads one tag conflict row and rejects missing or cross-entity rows. */
async function requireTagConflict(database: ConflictQuery, id: string) {
  const row = await database.select()
    .from(FieldConflict)
    .where(and(
      eq(FieldConflict.id, id),
      eq(FieldConflict.entityType, 'tag'),
    ))
    .then(rows => rows[0]);

  if (!row) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Tag conflict not found',
    });
  }

  return row;
}

/** Loads the current tag row and active winner for one conflict field. */
async function loadConflictContext(
  database: ConflictQuery,
  conflict: FieldConflictRow,
) {
  const enumId = enumIdFromEntityKey(conflict.entityKey);
  const row = await database.select()
    .from(Tag)
    .where(eq(Tag.enumId, enumId))
    .then(rows => rows[0]);

  if (!row) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Tag not found for conflict',
    });
  }

  const winner = await database.select()
    .from(FieldWinner)
    .where(and(
      eq(FieldWinner.entityType, 'tag'),
      eq(FieldWinner.status, 'active'),
      eq(FieldWinner.entityKey, toTagEntityKey(enumId)),
      eq(FieldWinner.fieldPath, conflict.fieldPath),
    ))
    .then(rows => rows[0]);

  return {
    enumId,
    row,
    winner,
    field: fieldFromPath(conflict.fieldPath),
  };
}

/** Builds one follow-up commit that resolves a tag conflict through the shared apply logic. */
function buildResolutionCommit(
  conflict: FieldConflictRow,
  row: TagRow,
  winner: FieldWinnerRow | undefined,
  value: unknown,
  commitKind: FieldCommitInsert['commitKind'],
  resolution: TagConflictResolveInput['resolution'],
  options: ResolveTagConflictOptions,
): FieldCommitInsert {
  return {
    entityType:             'tag',
    entityKey:              conflict.entityKey,
    fieldPath:              conflict.fieldPath,
    value,
    operation:              'set',
    commitKind,
    clientMutationId:       buildClientMutationId(conflict.id, conflict.fieldPath, resolution),
    editorRuntime:          options.editorRuntime,
    editorIdentity:         options.editorIdentity,
    expectedRowRevision:    buildTagRowRevision(row),
    expectedWinnerRevision: buildWinnerRevision(winner),
    baseRevision:           conflict.baseRevision,
    reviewStatus:           'auto_approved',
    reviewedBy:             options.editorIdentity,
    reviewedAt:             null,
    reviewReason:           `conflict:${resolution}`,
    projectionStatus:       'pending',
    syncStatus:             options.syncStatus,
    createdAt:              new Date(),
    projectedAt:            null,
  };
}

/** Resolves one tag conflict and returns the refreshed persisted row. */
export async function resolveTagConflict(
  database: ConflictDb,
  input: TagConflictResolveInput,
  options: ResolveTagConflictOptions,
) {
  return await database.transaction(async tx => {
    const conflict = await requireTagConflict(tx, input.id);
    const context = await loadConflictContext(tx, conflict);
    const resolvedAt = new Date();

    switch (input.resolution) {
      case 'accept_incoming': {
        if (conflict.incomingValue === undefined) {
          throw new ORPCError('BAD_REQUEST', {
            message: 'accept_incoming requires an incoming conflict value',
          });
        }

        await applyTagCommit(tx, buildResolutionCommit(
          conflict,
          context.row,
          context.winner,
          conflict.incomingValue,
          'conflict_resolution',
          input.resolution,
          options,
        ), {
          conflictTarget: options.conflictTarget,
        });
        break;
      }
      case 'winner_clear': {
        if (!autoBaseFields.has(context.field)) {
          throw new ORPCError('BAD_REQUEST', {
            message: 'winner_clear only supports auto-base tag fields',
          });
        }

        await applyTagCommit(tx, buildResolutionCommit(
          conflict,
          context.row,
          context.winner,
          conflict.candidateBaseValue ?? null,
          'winner_clear',
          input.resolution,
          options,
        ), {
          conflictTarget: options.conflictTarget,
        });
        break;
      }
      case 'keep_current_winner': {
        if (conflict.conflictKind === 'base_drift' && context.winner) {
          await tx.update(FieldWinner)
            .set({
              baseRevision: conflict.baseRevision,
              updatedAt:    resolvedAt,
            })
            .where(eq(FieldWinner.id, context.winner.id));
        }
        break;
      }
      case 'require_followup_commit':
        break;
      default:
        throw new ORPCError('BAD_REQUEST', {
          message: `Unsupported conflict resolution: ${String(input.resolution)}`,
        });
    }

    const updated = await tx.update(FieldConflict)
      .set({
        status:     'resolved',
        resolution: input.resolution,
        resolvedAt,
      })
      .where(eq(FieldConflict.id, input.id))
      .returning()
      .then(rows => rows[0]);

    if (!updated) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Tag conflict not found',
      });
    }

    return toConflictProfile(updated);
  });
}

/** Loads one paginated tag conflict list from the shared conflict table. */
export async function listTagConflicts(
  database: ConflictDb,
  input: TagConflictListInput,
): Promise<TagConflictListResult> {
  const conditions = [
    eq(FieldConflict.entityType, 'tag'),
  ];

  if (input.status) {
    conditions.push(eq(FieldConflict.status, input.status));
  }

  if (input.processingSide) {
    conditions.push(eq(FieldConflict.processingSide, input.processingSide));
  }

  if (input.processingStage) {
    conditions.push(eq(FieldConflict.processingStage, input.processingStage));
  }

  if (input.enumId != null) {
    conditions.push(eq(sql<number>`(${FieldConflict.entityKey} ->> 'enumId')::integer`, input.enumId));
  }

  const rows = await database.select()
    .from(FieldConflict)
    .where(and(...conditions))
    .orderBy(desc(FieldConflict.createdAt));

  const offset = (input.page - 1) * input.limit;
  const items = rows.map(toConflictProfile);

  return {
    items: items.slice(offset, offset + input.limit),
    total: items.length,
    page:  input.page,
    limit: input.limit,
  };
}

/** Loads one tag conflict detail row by id. */
export async function getTagConflict(
  database: ConflictDb,
  id: string,
) {
  return toConflictProfile(await requireTagConflict(database, id));
}
