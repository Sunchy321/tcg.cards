import { ORPCError } from '@orpc/server';
import { and, asc, eq } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { FieldSyncCursor } from '@tcg-cards/db/schema/local/hearthstone';
import { FieldCommit } from '@tcg-cards/db/schema/shared/hearthstone';
import {
  applyTagCommit,
  type ApplyTagCommitResult,
  type FieldCommitInsert,
  type FieldCommitRow,
} from './tag-commit';

/** Database handles accepted by desktop tag replication helpers. */
type SyncDb = ReturnType<typeof createDb>;

/** Transactions opened by desktop tag replication helpers. */
type SyncTx = Parameters<Parameters<SyncDb['transaction']>[0]>[0];

/** Push direction shared by cursor-backed desktop tag sync. */
const tagCommitStream = 'hearthstone.tag';

/** Default batch size used when one desktop sync run pushes local tag commits. */
const defaultPushLimit = 100;

/** Cursor rows persisted for one local desktop sync consumer. */
type FieldSyncCursorRow = typeof FieldSyncCursor.$inferSelect;

/** Result status returned after one local tag commit push attempt. */
export type TagPushStatus = 'applied' | 'duplicate' | 'blocked';

/** Stop reason reported when desktop push cannot continue. */
export type TagPushStopReason = 'conflict' | 'error';

/** One pushed local tag commit and the remote outcome observed for it. */
export type TagPushItem = {
  localCommitId: string;
  localSequence: number;
  clientMutationId: string;
  status: Exclude<TagPushStatus, 'blocked'>;
};

/** Inputs required for one cursor-backed desktop tag push run. */
export type PushPendingTagCommitsInput = {
  localDb: SyncDb;
  remoteDb: SyncDb;
  consumer: string;
  limit?: number;
  stream?: string;
};

/** Summary returned after one cursor-backed desktop tag push run. */
export type PushPendingTagCommitsResult = {
  stream: string;
  consumer: string;
  pushed: TagPushItem[];
  lastPushedSequence: number;
  blockedSequence: number | null;
  blockedReason: TagPushStopReason | null;
  blockedMessage: string | null;
};

/** Loads the current local cursor row for one desktop sync consumer. */
async function getCursor(
  database: SyncDb,
  consumer: string,
  stream: string,
) {
  return await database.select()
    .from(FieldSyncCursor)
    .where(and(
      eq(FieldSyncCursor.consumer, consumer),
      eq(FieldSyncCursor.stream, stream),
    ))
    .then(rows => rows[0]);
}

/** Normalizes one optional push limit into a safe positive batch size. */
function normalizePushLimit(limit: number | undefined) {
  if (limit == null) {
    return defaultPushLimit;
  }

  return Number.isInteger(limit) && limit > 0 ? limit : defaultPushLimit;
}

/** Maps one local history row into the insert shape accepted by remote apply logic. */
function toRemoteCommit(commit: FieldCommitRow): FieldCommitInsert {
  return {
    entityType:             commit.entityType,
    entityKey:              commit.entityKey,
    fieldPath:              commit.fieldPath,
    value:                  commit.value,
    operation:              commit.operation,
    commitKind:             commit.commitKind,
    clientMutationId:       commit.clientMutationId,
    editorRuntime:          commit.editorRuntime,
    editorIdentity:         commit.editorIdentity,
    expectedRowRevision:    commit.expectedRowRevision,
    expectedWinnerRevision: commit.expectedWinnerRevision,
    baseRevision:           commit.baseRevision,
    reviewStatus:           commit.reviewStatus,
    reviewedBy:             commit.reviewedBy,
    reviewedAt:             commit.reviewedAt,
    reviewReason:           commit.reviewReason,
    projectionStatus:       commit.projectionStatus,
    syncStatus:             'synced',
    createdAt:              commit.createdAt,
    projectedAt:            commit.projectedAt,
  };
}

/** Persists the new local push cursor together with the synced local commit status. */
async function markLocalCommitSynced(
  tx: SyncTx,
  input: {
    commitId: string;
    consumer: string;
    stream: string;
    sequence: number;
  },
) {
  await tx.update(FieldCommit)
    .set({
      syncStatus: 'synced',
    })
    .where(eq(FieldCommit.id, input.commitId));

  await tx.insert(FieldSyncCursor)
    .values({
      consumer:           input.consumer,
      stream:             input.stream,
      lastPulledSequence: 0,
      lastPushedSequence: input.sequence,
    })
    .onConflictDoUpdate({
      target: [FieldSyncCursor.consumer, FieldSyncCursor.stream],
      set:    {
        lastPushedSequence: input.sequence,
        updatedAt:          new Date(),
      },
    });
}

/** Translates one remote apply outcome into the local push item recorded for this run. */
function toPushItem(commit: FieldCommitRow, result: ApplyTagCommitResult): TagPushItem {
  return {
    localCommitId:     commit.id,
    localSequence:     commit.sequence,
    clientMutationId:  commit.clientMutationId,
    status:            result.status === 'duplicate' ? 'duplicate' : 'applied',
  };
}

/** Classifies one push failure into a stable desktop sync stop reason. */
function toBlockedReason(error: unknown): TagPushStopReason {
  if (error instanceof ORPCError && error.code === 'CONFLICT') {
    return 'conflict';
  }

  return 'error';
}

/** Renders one push failure into a stable desktop sync error message. */
function toBlockedMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown tag push error';
}

/** Pushes local pending tag commits to the remote database in sequence order. */
export async function pushPendingTagCommits(
  input: PushPendingTagCommitsInput,
): Promise<PushPendingTagCommitsResult> {
  const stream = input.stream ?? tagCommitStream;
  const limit = normalizePushLimit(input.limit);
  const cursor = await getCursor(input.localDb, input.consumer, stream);
  const lastPushedSequence = cursor?.lastPushedSequence ?? 0;

  const commits = await input.localDb.select()
    .from(FieldCommit)
    .where(and(
      eq(FieldCommit.entityType, 'tag'),
      eq(FieldCommit.syncStatus, 'pending_push'),
    ))
    .orderBy(asc(FieldCommit.sequence))
    .limit(limit);

  const pushed: TagPushItem[] = [];
  let pushedSequence = lastPushedSequence;

  for (const commit of commits) {
    try {
      const result = await input.remoteDb.transaction(async tx => await applyTagCommit(
        tx,
        toRemoteCommit(commit),
        {
          conflictTarget: {
            processingSide:  'remote',
            processingStage: 'apply',
          },
        },
      ));

      await input.localDb.transaction(async tx => await markLocalCommitSynced(tx, {
        commitId:  commit.id,
        consumer:  input.consumer,
        stream,
        sequence:  commit.sequence,
      }));

      pushed.push(toPushItem(commit, result));
      pushedSequence = commit.sequence;
    } catch (error) {
      return {
        stream,
        consumer:           input.consumer,
        pushed,
        lastPushedSequence: pushedSequence,
        blockedSequence:    commit.sequence,
        blockedReason:      toBlockedReason(error),
        blockedMessage:     toBlockedMessage(error),
      };
    }
  }

  return {
    stream,
    consumer:           input.consumer,
    pushed,
    lastPushedSequence: pushedSequence,
    blockedSequence:    null,
    blockedReason:      null,
    blockedMessage:     null,
  };
}
