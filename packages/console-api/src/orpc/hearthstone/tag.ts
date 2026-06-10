import { ORPCError, os as create } from '@orpc/server';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
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
  tagGetInput,
  tagListInput,
  tagListResult,
  tagProfile,
  tagUpdateInput,
} from '@tcg-cards/model/src/hearthstone/schema/tag';
import {
  listTags,
  getTag,
  saveTagEdit,
} from '../../lib/hearthstone/tag-commit';
import {
  getTagConflict,
  listTagConflicts,
  resolveTagConflict,
} from '../../lib/hearthstone/tag-conflict';
import type { ConsoleApiRequestMeta } from '../../request-meta';

const os = create.$context<{ meta?: ConsoleApiRequestMeta }>();

/** Commit rows loaded from the shared field history table. */
type FieldCommitRow = typeof FieldCommit.$inferSelect;

/** Converts one write-mode hint into the persisted sync state. */
function toSyncStatus(mode: ConsoleApiRequestMeta['syncMode']) {
  switch (mode) {
    case 'remote_edit':
      return 'synced';
    case 'pull':
      return 'pulled';
    case 'local_edit':
    default:
      return 'pending_push';
  }
}

/** Maps one request runtime mode to the side and stage that process the commit. */
function toConflictTarget(mode: ConsoleApiRequestMeta['syncMode']) {
  switch (mode) {
    case 'remote_edit':
      return {
        processingSide:  'remote',
        processingStage: 'apply',
      } as const;
    case 'pull':
      return {
        processingSide:  'local',
        processingStage: 'replay',
      } as const;
    case 'local_edit':
    default:
      return {
        processingSide:  'local',
        processingStage: 'apply',
      } as const;
  }
}

/** Resolves the persisted commit metadata from one caller-provided request meta object. */
function resolveCommitMeta(meta: ConsoleApiRequestMeta | undefined) {
  return {
    editorRuntime:  meta?.editorRuntime ?? 'desktop',
    editorIdentity: meta?.editorIdentity ?? 'unknown',
    editorSource:   meta?.editorSource ?? 'manual',
    syncStatus:     toSyncStatus(meta?.syncMode),
    conflictTarget: toConflictTarget(meta?.syncMode),
  };
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Maps one persisted field commit into the public tag commit shape. */
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
    editorIdentity:         row.editorIdentity,
    editorSource:           row.editorSource,
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

/** Matches one public tag commit profile against the current list filters. */
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

/** Returns whether one actual entity key contains every filter key/value pair. */
function matchesEntityKey(actual: unknown, expected: Record<string, unknown>) {
  if (typeof actual !== 'object' || actual == null || Array.isArray(actual)) {
    return false;
  }

  const actualKey = actual as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => actualKey[key] === value);
}

// ─── Routes ──────────────────────────────────────────────────────────

const list = os
  .route({
    method:      'GET',
    description: 'List Hearthstone tag configurations',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagListInput)
  .output(tagListResult)
  .handler(async ({ input }) => {
    return await listTags(db, input);
  });

const get = os
  .route({
    method:      'GET',
    description: 'Get one Hearthstone tag configuration',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagGetInput)
  .output(tagProfile)
  .handler(async ({ input }) => {
    return await getTag(db, input.enumId);
  });

const listCommits = os
  .route({
    method:      'GET',
    description: 'List Hearthstone tag field commits',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(fieldCommitListInput)
  .output(fieldCommitListResult)
  .handler(async ({ input }) => {
    const rows = await db.select()
      .from(FieldCommit)
      .where(eq(FieldCommit.entityType, 'tag'))
      .orderBy(desc(FieldCommit.sequence));

    const profiles = rows.map(toCommitProfile).filter(commit => matchesCommitFilters(commit, input));
    const offset = (input.page - 1) * input.limit;

    return {
      items: profiles.slice(offset, offset + input.limit),
      total: profiles.length,
      page:  input.page,
      limit: input.limit,
    };
  });

const getCommit = os
  .route({
    method:      'GET',
    description: 'Get one Hearthstone tag field commit',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(fieldCommitGetInput)
  .output(fieldCommitProfile)
  .handler(async ({ input }) => {
    const row = await db.select()
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

const listConflicts = os
  .route({
    method:      'GET',
    description: 'List Hearthstone tag conflicts',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagConflictListInput)
  .output(tagConflictListResult)
  .handler(async ({ input }) => await listTagConflicts(db, input));

const getConflict = os
  .route({
    method:      'GET',
    description: 'Get one Hearthstone tag conflict',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagConflictGetInput)
  .output(tagConflictProfile)
  .handler(async ({ input }) => await getTagConflict(db, input.id));

const manualUpdate = os
  .route({
    method:      'PUT',
    description: 'Save one manual Hearthstone tag edit',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagUpdateInput)
  .output(tagProfile)
  .handler(async ({ input, context }) => {
    const meta = resolveCommitMeta(context.meta);
    return await db.transaction(async tx => await saveTagEdit(tx, input, {
      syncStatus:     meta.syncStatus,
      editorRuntime:  meta.editorRuntime,
      editorIdentity: meta.editorIdentity,
      conflictTarget: meta.conflictTarget,
    }));
  });

const resolveConflict = os
  .route({
    method:      'POST',
    description: 'Resolve one Hearthstone tag conflict',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagConflictResolveInput)
  .output(tagConflictProfile)
  .handler(async ({ input, context }) => {
    const commitMeta = resolveCommitMeta(context.meta);

    return await resolveTagConflict(db, input, {
      editorRuntime:  commitMeta.editorRuntime,
      editorIdentity: commitMeta.editorIdentity,
      editorSource:   commitMeta.editorSource,
      syncStatus:     commitMeta.syncStatus,
      conflictTarget: commitMeta.conflictTarget,
    });
  });

export const tagTrpc = {
  list,
  get,
  listCommits,
  getCommit,
  listConflicts,
  getConflict,
  manualUpdate,
  resolveConflict,
};
