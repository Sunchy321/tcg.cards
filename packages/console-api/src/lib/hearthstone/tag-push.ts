import { ORPCError } from '@orpc/server';
import { and, asc, eq } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { FieldSyncCursor } from '@tcg-cards/db/schema/local/hearthstone';
import { FieldCommit, FieldConflict, FieldWinner, Tag as TagTable } from '@tcg-cards/db/schema/shared/hearthstone';
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
  onProgress?: (event: { completed: number; total: number }) => void;
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

/** No limit used when the caller omitted one explicit push limit. */
const noLimitSentinel = Number.MAX_SAFE_INTEGER;

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
    editorSource:           commit.editorSource,
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

/** Extracts the tag enumId from one commit's entityKey. */
function enumIdFromCommit(commit: FieldCommitInsert) {
  const ek = commit.entityKey as { enumId?: unknown };
  if (typeof ek?.enumId !== 'number') {
    throw new Error('Invalid tag entityKey');
  }
  return ek.enumId;
}

/** Pushes local pending tag commits to the remote database in sequence order. */
export async function pushPendingTagCommits(
  input: PushPendingTagCommitsInput,
): Promise<PushPendingTagCommitsResult> {
  const stream = input.stream ?? tagCommitStream;
  const limit = input.limit ?? noLimitSentinel;
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

  const total = commits.length;
  const pushed: TagPushItem[] = [];
  let pushedSequence = lastPushedSequence;

  input.onProgress?.({ completed: 0, total });

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
      input.onProgress?.({ completed: pushed.length, total });
    } catch (error) {
      // Write conflict to remote DB in a standalone transaction (the main one rolled back).
      const reason = toBlockedReason(error);
      const message = toBlockedMessage(error);

      try {
        // Load current remote state to populate conflict values
        const [remoteTag, remoteWinner] = await Promise.all([
          input.remoteDb.select()
            .from(TagTable)
            .where(eq(TagTable.enumId, enumIdFromCommit(commit)))
            .then(rows => rows[0] ?? null),
          input.remoteDb.select()
            .from(FieldWinner)
            .where(and(
              eq(FieldWinner.entityType, 'tag'),
              eq(FieldWinner.status, 'active'),
              eq(FieldWinner.entityKey, commit.entityKey),
              eq(FieldWinner.fieldPath, commit.fieldPath),
            ))
            .then(rows => rows[0] ?? null),
        ]);

        const field = commit.fieldPath.replace(/^tag\./, '') as string;

        await input.remoteDb.insert(FieldConflict).values({
          processingSide:  'remote',
          processingStage: 'apply',
          conflictKind:    reason === 'conflict' ? 'expected_row_revision_mismatch' : 'history_replay',
          entityType:      'tag',
          entityKey:       commit.entityKey,
          fieldPath:       commit.fieldPath,
          sourceSummary:   {
            clientMutationId: commit.clientMutationId,
            commitKind:       commit.commitKind,
            operation:        commit.operation,
            editorRuntime:    commit.editorRuntime,
          },
          localValue:       (remoteTag as Record<string, unknown> | null)?.[field] ?? null,
          incomingValue:    commit.value,
          winnerValue:      remoteWinner?.winnerValue ?? null,
          effectiveValue:   (remoteTag as Record<string, unknown> | null)?.[field] ?? null,
          baseRevision:     commit.baseRevision,
          status:           'open',
          reason:           message,
        });
      } catch {
        // Best-effort conflict write.
      }

      return {
        stream,
        consumer:           input.consumer,
        pushed,
        lastPushedSequence: pushedSequence,
        blockedSequence:    commit.sequence,
        blockedReason:      reason,
        blockedMessage:     message,
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
