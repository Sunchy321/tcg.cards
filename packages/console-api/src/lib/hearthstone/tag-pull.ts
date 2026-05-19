import { ORPCError } from '@orpc/server';
import { and, asc, eq, gt } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { FieldSyncCursor } from '@tcg-cards/db/schema/local/hearthstone';
import { FieldCommit, FieldConflict } from '@tcg-cards/db/schema/shared/hearthstone';
import {
  applyTagCommit,
  type ApplyTagCommitConflictInput,
  type ApplyTagCommitResult,
  type DbTx,
  type FieldCommitInsert,
  type FieldCommitRow,
} from './tag-commit';

/** Database handles accepted by desktop tag replication helpers. */
type SyncDb = ReturnType<typeof createDb>;

/** Transactions opened by desktop tag replication helpers. */
type SyncTx = Parameters<Parameters<SyncDb['transaction']>[0]>[0];

/** Default batch size used when one desktop sync run pulls remote tag commits. */
const defaultPullLimit = 100;

/** Pull direction shared by cursor-backed desktop tag sync. */
const tagCommitStream = 'hearthstone.tag';

/** Result status returned after one remote tag commit replay attempt. */
export type TagPullStatus = 'applied' | 'duplicate' | 'accepted_without_projection' | 'blocked';

/** Stop reason reported when desktop pull cannot continue. */
export type TagPullStopReason = 'conflict' | 'error';

/** One remote tag commit replayed into local state during one pull run. */
export type TagPullItem = {
  remoteCommitId: string;
  remoteSequence: number;
  clientMutationId: string;
  status: Exclude<TagPullStatus, 'blocked'>;
};

/** Inputs required for one cursor-backed desktop tag pull run. */
export type PullRemoteTagCommitsInput = {
  localDb: SyncDb;
  remoteDb: SyncDb;
  consumer: string;
  limit?: number;
  stream?: string;
};

/** Summary returned after one cursor-backed desktop tag pull run. */
export type PullRemoteTagCommitsResult = {
  stream: string;
  consumer: string;
  pulled: TagPullItem[];
  lastPulledSequence: number;
  blockedSequence: number | null;
  blockedReason: TagPullStopReason | null;
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

/** Normalizes one optional pull limit into a safe positive batch size. */
function normalizePullLimit(limit: number | undefined) {
  if (limit == null) {
    return defaultPullLimit;
  }

  return Number.isInteger(limit) && limit > 0 ? limit : defaultPullLimit;
}

/** Maps one remote history row into the insert shape accepted by local replay logic. */
function toLocalReplayCommit(commit: FieldCommitRow): FieldCommitInsert {
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
    syncStatus:             'pulled',
    createdAt:              commit.createdAt,
    projectedAt:            commit.projectedAt,
  };
}

/** Persists the new local pull cursor after one remote tag commit replays successfully. */
async function markLocalCommitPulled(
  tx: SyncTx,
  input: {
    consumer: string;
    stream: string;
    sequence: number;
  },
) {
  const current = await tx.select()
    .from(FieldSyncCursor)
    .where(and(
      eq(FieldSyncCursor.consumer, input.consumer),
      eq(FieldSyncCursor.stream, input.stream),
    ))
    .then(rows => rows[0]);

  await tx.insert(FieldSyncCursor)
    .values({
      consumer:           input.consumer,
      stream:             input.stream,
      lastPulledSequence: input.sequence,
      lastPushedSequence: current?.lastPushedSequence ?? 0,
    })
    .onConflictDoUpdate({
      target: [FieldSyncCursor.consumer, FieldSyncCursor.stream],
      set:    {
        lastPulledSequence: input.sequence,
        updatedAt:          new Date(),
      },
    });
}

/** Translates one local replay outcome into the pull item recorded for this run. */
function toPullItem(commit: FieldCommitRow, result: ApplyTagCommitResult): TagPullItem {
  return {
    remoteCommitId:    commit.id,
    remoteSequence:    commit.sequence,
    clientMutationId:  commit.clientMutationId,
    status:            result.status,
  };
}

/** Classifies one pull failure into a stable desktop sync stop reason. */
function toBlockedReason(error: unknown): TagPullStopReason {
  if (error instanceof ORPCError && error.code === 'CONFLICT') {
    return 'conflict';
  }

  return 'error';
}

/** Renders one pull failure into a stable desktop sync error message. */
function toBlockedMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown tag pull error';
}

/** Persists one local replay conflict with the remote commit sequence attached. */
async function insertReplayConflict(
  tx: DbTx,
  input: ApplyTagCommitConflictInput & { remoteSequence: number },
) {
  await tx.insert(FieldConflict).values({
    processingSide:  'local',
    processingStage: 'replay',
    conflictKind:    input.reason,
    entityType:      'tag',
    entityKey:       input.commit.entityKey,
    fieldPath:       input.commit.fieldPath,
    sourceSummary:   {
      remoteSequence:    input.remoteSequence,
      clientMutationId:  input.commit.clientMutationId,
      commitKind:        input.commit.commitKind,
      operation:         input.commit.operation,
      editorRuntime:     input.commit.editorRuntime,
      editorIdentity:    input.commit.editorIdentity,
    },
    candidateBaseValue: null,
    localValue:         input.current[input.commit.fieldPath.replace(/^tag\./, '') as keyof typeof input.current] ?? null,
    incomingValue:      input.commit.value,
    effectiveValue:     input.current[input.commit.fieldPath.replace(/^tag\./, '') as keyof typeof input.current] ?? null,
    winnerValue:        input.winner?.winnerValue,
    baseRevision:       input.commit.baseRevision,
    status:             'open',
    reason:             input.reason,
    resolution:         null,
    resolvedAt:         null,
  });
}

/** Pulls remote tag commits in order and replays them into the local database. */
export async function pullRemoteTagCommits(
  input: PullRemoteTagCommitsInput,
): Promise<PullRemoteTagCommitsResult> {
  const stream = input.stream ?? tagCommitStream;
  const limit = normalizePullLimit(input.limit);
  const cursor = await getCursor(input.localDb, input.consumer, stream);
  const lastPulledSequence = cursor?.lastPulledSequence ?? 0;

  const commits = await input.remoteDb.select()
    .from(FieldCommit)
    .where(and(
      eq(FieldCommit.entityType, 'tag'),
      gt(FieldCommit.sequence, lastPulledSequence),
    ))
    .orderBy(asc(FieldCommit.sequence))
    .limit(limit);

  const pulled: TagPullItem[] = [];
  let pulledSequence = lastPulledSequence;

  for (const commit of commits) {
    try {
      const result = await input.localDb.transaction(async tx => {
        const replayCommit = toLocalReplayCommit(commit);

        return await applyTagCommit(tx, replayCommit, {
          conflictTarget: {
            processingSide:  'local',
            processingStage: 'replay',
          },
          onConflict: async (conflictTx, conflict) => await insertReplayConflict(conflictTx, {
            ...conflict,
            remoteSequence: commit.sequence,
          }),
        });
      });

      await input.localDb.transaction(async tx => await markLocalCommitPulled(tx, {
        consumer: input.consumer,
        stream,
        sequence: commit.sequence,
      }));

      pulled.push(toPullItem(commit, result));
      pulledSequence = commit.sequence;
    } catch (error) {
      return {
        stream,
        consumer:           input.consumer,
        pulled,
        lastPulledSequence: pulledSequence,
        blockedSequence:    commit.sequence,
        blockedReason:      toBlockedReason(error),
        blockedMessage:     toBlockedMessage(error),
      };
    }
  }

  return {
    stream,
    consumer:           input.consumer,
    pulled,
    lastPulledSequence: pulledSequence,
    blockedSequence:    null,
    blockedReason:      null,
    blockedMessage:     null,
  };
}
