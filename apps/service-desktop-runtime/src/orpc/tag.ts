import { ORPCError } from '@orpc/server';
import { and, desc, eq } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db/db';
import { FieldCommit } from '@tcg-cards/db/schema/shared/hearthstone';
import {
  fieldCommitGetInput,
  fieldCommitListInput,
  fieldCommitListResult,
  fieldCommitProfile,
  type FieldCommitListInput,
  type FieldCommitProfile,
} from '@tcg-cards/model/src/field-commit';
import {
  tagConflictGetInput,
  tagConflictListInput,
  tagConflictListResult,
  tagConflictProfile,
  tagConflictResolveInput,
} from '@tcg-cards/model/src/hearthstone/schema/tag';
import {
  getTagConflict,
  listTagConflicts,
  resolveTagConflict,
} from '@tcg-cards/console-api/lib/hearthstone/tag-conflict';

import { os } from './index';
import { readLocalDatabaseUrl } from '../runtime-config';

/** Commit rows loaded from the shared field history table. */
type FieldCommitRow = typeof FieldCommit.$inferSelect;

/** Local desktop database URL required by runtime-backed tag conflict procedures. */
function requireLocalDatabaseUrl() {
  const connection = readLocalDatabaseUrl();

  if (!connection) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Local desktop database URL is not configured',
    });
  }

  return connection;
}

/** Desktop-local Drizzle database used by runtime-backed tag conflict procedures. */
function getLocalDb() {
  return createDb(requireLocalDatabaseUrl());
}

/** Converts one persisted timestamp into an ISO string. */
function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Maps one persisted field commit into the shared public commit shape. */
function toCommitProfile(row: FieldCommitRow): FieldCommitProfile {
  return {
    id:                     row.id,
    sequence:               row.sequence,
    entityType:             row.entityType,
    entityKey:              row.entityKey,
    fieldPath:              row.fieldPath,
    value:                  row.value ?? null,
    operation:              row.operation,
    commitKind:             row.commitKind,
    clientMutationId:       row.clientMutationId,
    editorRuntime:          row.editorRuntime,
    editorIdentity:         row.editorIdentity ?? null,
    expectedRowRevision:    row.expectedRowRevision,
    expectedWinnerRevision: row.expectedWinnerRevision ?? null,
    baseRevision:           row.baseRevision,
    reviewStatus:           row.reviewStatus,
    reviewedBy:             row.reviewedBy ?? null,
    reviewedAt:             row.reviewedAt ? toIsoString(row.reviewedAt) : null,
    reviewReason:           row.reviewReason ?? null,
    projectionStatus:       row.projectionStatus,
    syncStatus:             row.syncStatus,
    createdAt:              toIsoString(row.createdAt),
    projectedAt:            row.projectedAt ? toIsoString(row.projectedAt) : null,
  };
}

/** Returns whether one actual entity key contains every filter key/value pair. */
function matchesEntityKey(actual: unknown, expected: Record<string, unknown>) {
  if (typeof actual !== 'object' || actual == null || Array.isArray(actual)) {
    return false;
  }

  const actualKey = actual as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => actualKey[key] === value);
}

/** Matches one shared commit profile against the current list filters. */
function matchesCommitFilters(commit: FieldCommitProfile, input: FieldCommitListInput) {
  if (input.entityType && commit.entityType !== input.entityType) {
    return false;
  }

  if (input.entityKey && !matchesEntityKey(commit.entityKey, input.entityKey)) {
    return false;
  }

  const fieldPath = input.fieldPath?.trim();
  if (fieldPath && commit.fieldPath !== fieldPath) {
    return false;
  }

  const commitKind = input.commitKind?.trim();
  if (commitKind && commit.commitKind !== commitKind) {
    return false;
  }

  const reviewStatus = input.reviewStatus?.trim();
  if (reviewStatus && commit.reviewStatus !== reviewStatus) {
    return false;
  }

  const syncStatus = input.syncStatus?.trim();
  if (syncStatus && commit.syncStatus !== syncStatus) {
    return false;
  }

  return true;
}

/** Lists local Hearthstone tag commits from the desktop runtime database. */
const listCommits = os
  .route({
    method:      'GET',
    description: 'List local Hearthstone tag commits',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(fieldCommitListInput)
  .output(fieldCommitListResult)
  .handler(async ({ input }) => {
    const rows = await getLocalDb().select()
      .from(FieldCommit)
      .where(eq(FieldCommit.entityType, 'tag'))
      .orderBy(desc(FieldCommit.sequence));

    const items = rows.map(toCommitProfile).filter(commit => matchesCommitFilters(commit, input));
    const offset = (input.page - 1) * input.limit;

    return {
      items: items.slice(offset, offset + input.limit),
      total: items.length,
      page:  input.page,
      limit: input.limit,
    };
  });

/** Reads one local Hearthstone tag commit from the desktop runtime database. */
const getCommit = os
  .route({
    method:      'GET',
    description: 'Get one local Hearthstone tag commit',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(fieldCommitGetInput)
  .output(fieldCommitProfile)
  .handler(async ({ input }) => {
    const row = await getLocalDb().select()
      .from(FieldCommit)
      .where(and(
        eq(FieldCommit.id, input.id),
        eq(FieldCommit.entityType, 'tag'),
      ))
      .then(rows => rows[0]);

    if (!row) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Tag commit not found',
      });
    }

    return toCommitProfile(row);
  });

/** Lists local Hearthstone tag conflicts from the desktop runtime database. */
const listConflicts = os
  .route({
    method:      'GET',
    description: 'List local Hearthstone tag conflicts',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(tagConflictListInput)
  .output(tagConflictListResult)
  .handler(async ({ input }) => await listTagConflicts(getLocalDb(), input));

/** Reads one local Hearthstone tag conflict from the desktop runtime database. */
const getConflict = os
  .route({
    method:      'GET',
    description: 'Get one local Hearthstone tag conflict',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(tagConflictGetInput)
  .output(tagConflictProfile)
  .handler(async ({ input }) => await getTagConflict(getLocalDb(), input.id));

/** Resolves one local Hearthstone tag conflict in the desktop runtime database. */
const resolveConflict = os
  .route({
    method:      'POST',
    description: 'Resolve one local Hearthstone tag conflict',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(tagConflictResolveInput)
  .output(tagConflictProfile)
  .handler(async ({ input }) => await resolveTagConflict(getLocalDb(), input, {
    editorRuntime:  'desktop',
    editorIdentity: 'desktop-runtime',
    syncStatus:     'pending_push',
    conflictTarget: {
      processingSide:  'local',
      processingStage: 'apply',
    },
  }));

/** Groups the desktop runtime tag procedures under one router namespace. */
export const tagRouter = {
  listCommits,
  getCommit,
  listConflicts,
  getConflict,
  resolveConflict,
};
