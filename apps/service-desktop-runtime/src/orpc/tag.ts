import { eventIterator, ORPCError } from '@orpc/server';
import { and, desc, eq } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
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
} from '@tcg-cards/console-api/lib/hearthstone/tag-commit';
import {
  getTagConflict,
  listTagConflicts,
  resolveTagConflict,
} from '@tcg-cards/console-api/lib/hearthstone/tag-conflict';
import { pushPendingTagCommits } from '@tcg-cards/console-api/lib/hearthstone/tag-push';

import { os } from './index';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { requireHearthstonePublishTarget } from '../lib/hearthstone/hsdata-publish-target';
import { readEditorIdentity } from '../runtime-config';
import {
  getIncompletePushBatch,
  listPushBatches,
  startTagPushJob,
  watchTagPushJob,
  type TagPushProgressEvent,
} from '../lib/hearthstone/tag-push-progress';
import { z } from 'zod';

/** Commit rows loaded from the shared field history table. */
type FieldCommitRow = typeof FieldCommit.$inferSelect;

const tagPushResult = z.strictObject({
  stream: z.string(),
  consumer: z.string(),
  pushed: z.array(z.strictObject({
    localCommitId: z.string(),
    localSequence: z.number(),
    clientMutationId: z.string(),
    status: z.enum(['applied', 'duplicate']),
  })),
  lastPushedSequence: z.number(),
  blockedSequence: z.number().nullable(),
  blockedReason: z.enum(['conflict', 'error']).nullable(),
  blockedMessage: z.string().nullable(),
});

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

// ─── Existing routes ────────────────────────────────────────────────

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
    editorIdentity: readEditorIdentity(),
    editorSource:   'conflict-resolution',
    syncStatus:     'pending_push',
    conflictTarget: {
      processingSide:  'local',
      processingStage: 'apply',
    },
  }));

// ─── New CRUD routes ─────────────────────────────────────────────────

/** Lists local Hearthstone tag configurations. */
const list = os
  .route({
    method:      'GET',
    description: 'List local Hearthstone tag configurations',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(tagListInput)
  .output(tagListResult)
  .handler(async ({ input }) => {
    return await listTags(getLocalDb(), input);
  });

/** Reads one local Hearthstone tag configuration. */
const get = os
  .route({
    method:      'GET',
    description: 'Get one local Hearthstone tag configuration',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(tagGetInput)
  .output(tagProfile)
  .handler(async ({ input }) => {
    return await getTag(getLocalDb(), input.enumId);
  });

/** Saves one manual tag edit to the local database via the field commit workflow. */
const manualUpdate = os
  .route({
    method:      'PUT',
    description: 'Save one manual Hearthstone tag edit to the local database',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(tagUpdateInput)
  .output(tagProfile)
  .handler(async ({ input }) => {
    const db = getLocalDb();
    return await db.transaction(async tx => await saveTagEdit(tx, input, {
      syncStatus:     'pending_push',
      editorRuntime:  'desktop',
      editorIdentity: readEditorIdentity(),
      editorSource:   'manual',
      conflictTarget: { processingSide: 'local', processingStage: 'apply' },
    }));
  });

/** Pushes pending local tag commits to the remote database. */
const pushToRemote = os
  .route({
    method:      'POST',
    description: 'Push pending local tag commits to the remote database',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(z.strictObject({
    limit: z.number().int().positive().optional(),
  }).optional())
  .output(tagPushResult)
  .handler(async ({ input }) => {
    const target = requireHearthstonePublishTarget();
    const localDb = getLocalDb();
    const remoteDb = createDb(target.connectionString);

    try {
      return await pushPendingTagCommits({
        localDb,
        remoteDb,
        consumer: 'desktop',
        limit:    input?.limit,
      });
    } finally {
      await remoteDb.$client.end({ timeout: 1 });
    }
  });

const tagPushProgressEvent = z.object({
  phase:           z.string(),
  message:         z.string(),
  startedAt:       z.string(),
  finishedAt:      z.string().nullable(),
  totalCount:      z.number().int().nonnegative().nullable(),
  completedCount:  z.number().int().nonnegative().nullable(),
  pushed:          z.array(z.object({
    localSequence:    z.number(),
    clientMutationId: z.string(),
    status:           z.enum(['applied', 'duplicate']),
  })),
  blockedReason:   z.string().nullable(),
  blockedMessage:  z.string().nullable(),
  blockedSequence: z.number().nullable(),
});

/** Starts a tag push job with progress streaming and returns immediately. */
const pushToRemoteWithProgress = os
  .route({
    method:      'POST',
    description: 'Push pending local tag commits to remote with progress streaming',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(z.strictObject({
    limit: z.number().int().positive().optional(),
  }).optional())
  .output(z.strictObject({ ok: z.boolean() }))
  .handler(async ({ input }) => {
    const target = requireHearthstonePublishTarget();
    startTagPushJob(target.connectionString, input?.limit);
    return { ok: true };
  });

/** Streams progress events for the current tag push job. */
const watchPushProgress = os
  .route({
    method:      'GET',
    description: 'Watch the current tag push job progress as a stream of events',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .output(eventIterator(tagPushProgressEvent))
  .handler(async function* () {
    yield* watchTagPushJob();
  });

const pushBatchProfile = z.object({
  id:              z.string(),
  stream:          z.string(),
  consumer:        z.string(),
  status:          z.string(),
  pushedCount:     z.number(),
  duplicateCount:  z.number(),
  blockedReason:   z.string().nullable(),
  blockedMessage:  z.string().nullable(),
  blockedSequence: z.number().nullable(),
  startedAt:       z.string(),
  completedAt:     z.string().nullable(),
  createdAt:       z.string(),
});

const getIncompletePushBatchRoute = os
  .route({
    method:      'GET',
    description: 'Check for an incomplete push batch that may need resuming',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .output(z.object({
    id:        z.string(),
    stream:    z.string(),
    startedAt: z.string(),
  }).nullable())
  .handler(async () => await getIncompletePushBatch());

const listPushBatchesRoute = os
  .route({
    method:      'GET',
    description: 'List recent push batch history',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .output(z.array(pushBatchProfile))
  .handler(async () => {
    const rows = await listPushBatches(20);
    return rows.map(row => ({
      id:              row.id,
      stream:          row.stream,
      consumer:        row.consumer,
      status:          row.status,
      pushedCount:     row.pushedCount,
      duplicateCount:  row.duplicateCount,
      blockedReason:   row.blockedReason ?? null,
      blockedMessage:  row.blockedMessage ?? null,
      blockedSequence: row.blockedSequence ?? null,
      startedAt:       row.startedAt instanceof Date ? row.startedAt.toISOString() : String(row.startedAt),
      completedAt:     row.completedAt ? (row.completedAt instanceof Date ? row.completedAt.toISOString() : String(row.completedAt)) : null,
      createdAt:       row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));
  });

/** Groups the desktop runtime tag procedures under one router namespace. */
export const tagRouter = {
  list,
  get,
  listCommits,
  getCommit,
  listConflicts,
  getConflict,
  getIncompletePushBatch: getIncompletePushBatchRoute,
  listPushBatches: listPushBatchesRoute,
  manualUpdate,
  pushToRemote,
  pushToRemoteWithProgress,
  watchPushProgress,
  resolveConflict,
};
