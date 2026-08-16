import { pushPendingTagCommits } from '@tcg-cards/console-api/lib/hearthstone/tag-push';

import { createDb } from '@tcg-cards/db';
import { desc, eq } from 'drizzle-orm';
import { PushBatch } from '@tcg-cards/db/schema/local/hearthstone';

import { getLocalDb } from './hsdata-local-db';

/** Tag push phases exposed to the frontend progress UI. */
export type TagPushPhase =
  | 'pushing'
  | 'completed'
  | 'failed';

/** One pushed commit result. */
export interface TagPushItemLog {
  localSequence: number;
  clientMutationId: string;
  status: 'applied' | 'duplicate';
}

/** Progress event streamed to the frontend. */
export interface TagPushProgressEvent {
  phase: TagPushPhase | string;
  message: string;
  startedAt: string;
  finishedAt: string | null;
  totalCount: number | null;
  completedCount: number | null;
  pushed: TagPushItemLog[];
  blockedReason: string | null;
  blockedMessage: string | null;
  blockedSequence: number | null;
}

interface ProgressSubscriber {
  publish: (event: TagPushProgressEvent) => void;
}

let currentJob: TagPushProgressEvent | null = null;
const subscribers = new Set<ProgressSubscriber>();

function isTerminal(phase: string): boolean {
  return phase === 'completed' || phase === 'failed';
}

function notify(event: TagPushProgressEvent): void {
  currentJob = event;
  for (const subscriber of subscribers) {
    subscriber.publish(event);
  }
}

async function* streamProgress(): AsyncGenerator<TagPushProgressEvent> {
  const queue: TagPushProgressEvent[] = [];
  let wake: (() => void) | null = null;
  let stopped = false;

  const push = (event: TagPushProgressEvent) => {
    if (stopped) return;
    queue.push(event);
    if (wake) { const resolve = wake; wake = null; resolve(); }
  };

  const subscriber: ProgressSubscriber = { publish: push };
  subscribers.add(subscriber);
  const unsubscribe = () => { subscribers.delete(subscriber); };

  if (currentJob) push(currentJob);

  try {
    while (!stopped) {
      if (queue.length === 0) {
        await new Promise<void>(resolve => { wake = resolve; });
      }
      while (queue.length > 0) {
        const event = queue.shift()!;
        yield event;
        if (isTerminal(event.phase)) return;
      }
    }
  } finally {
    stopped = true;
    if (wake) wake();
    unsubscribe();
  }
}

/** Starts a tag push job with progress streaming. Runs asynchronously. */
export function startTagPushJob(connectionString: string, limit?: number): void {
  const now = new Date().toISOString();
  notify({
    phase: 'pushing',
    message: '正在推送 tag commits 到远端...',
    startedAt: now,
    finishedAt: null,
    totalCount: null,
    completedCount: null,
    pushed: [],
    blockedReason: null,
    blockedMessage: null,
    blockedSequence: null,
  });

  void runPush(connectionString, limit);
}

/** Checks for an incomplete push batch that may need to be resumed. */
export async function getIncompletePushBatch(): Promise<{
  id: string;
  stream: string;
  startedAt: string;
} | null> {
  const db = getLocalDb();
  const row = await db.select()
    .from(PushBatch)
    .where(eq(PushBatch.status, 'pushing'))
    .orderBy(desc(PushBatch.createdAt))
    .limit(1)
    .then(rows => rows[0]);

  if (!row) return null;

  return {
    id:        row.id,
    stream:    row.stream,
    startedAt: row.startedAt instanceof Date ? row.startedAt.toISOString() : String(row.startedAt),
  };
}

/** Returns the current tag push job snapshot, or null. */
export function getCurrentTagPushJob(): TagPushProgressEvent | null {
  return currentJob;
}

/** Async generator that streams tag push progress events. */
export function watchTagPushJob(): AsyncGenerator<TagPushProgressEvent> {
  return streamProgress();
}

/** Returns the most recent push batches, newest first. */
export async function listPushBatches(limit = 20) {
  const db = getLocalDb();
  return await db.select()
    .from(PushBatch)
    .orderBy(desc(PushBatch.createdAt))
    .limit(limit);
}

/** Status = completed | failed */
type PushStatus = 'completed' | 'failed';

/** Runs the actual push logic in background, updating progress and persisting result. */
async function runPush(connectionString: string, limit?: number) {
  const localDb = getLocalDb();
  const remoteDb = createDb(connectionString);
  const startedAt = new Date();

  // Persist 'pushing' state first, so incomplete batches are detectable after restart.
  const batchId = crypto.randomUUID();
  await localDb.insert(PushBatch).values({
    id:              batchId,
    stream:          'hearthstone.tag',
    consumer:        'desktop',
    status:          'pushing',
    pushedCount:     0,
    duplicateCount:  0,
    startedAt,
  });

  try {
    const result = await pushPendingTagCommits({
      localDb,
      remoteDb,
      consumer: 'desktop',
      limit,
      onProgress: ({ completed, total }) => {
        notify({
          phase: 'pushing',
          message: `正在推送 ${completed}/${total}...`,
          startedAt: startedAt.toISOString(),
          finishedAt: null,
          totalCount: total,
          completedCount: completed,
          pushed: [],
          blockedReason: null,
          blockedMessage: null,
          blockedSequence: null,
        });
      },
    });

    const status: PushStatus = result.blockedReason ? 'failed' : 'completed';
    await localDb.update(PushBatch)
      .set({
        status:          status,
        stream:          result.stream,
        pushedCount:     result.pushed.filter(p => p.status === 'applied').length,
        duplicateCount:  result.pushed.filter(p => p.status === 'duplicate').length,
        blockedReason:   result.blockedReason,
        blockedMessage:  result.blockedMessage,
        blockedSequence: result.blockedSequence,
        completedAt:     new Date(),
      })
      .where(eq(PushBatch.id, batchId));

    notify({
      phase: status,
      message: result.blockedReason
        ? `推送被阻止于 ${result.blockedReason}: ${result.blockedMessage}`
        : `推送完成：${result.pushed.length} 条 commit`,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      totalCount: result.pushed.length + (result.blockedSequence ? 1 : 0),
      completedCount: result.pushed.length,
      pushed: result.pushed,
      blockedReason: result.blockedReason,
      blockedMessage: result.blockedMessage,
      blockedSequence: result.blockedSequence,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await localDb.update(PushBatch)
      .set({
        status:         'failed',
        pushedCount:    0,
        duplicateCount: 0,
        blockedReason:  'error',
        blockedMessage: message,
        completedAt:    new Date(),
      })
      .where(eq(PushBatch.id, batchId));

    notify({
      phase: 'failed',
      message: `推送失败: ${message}`,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      totalCount: null,
      completedCount: null,
      pushed: [],
      blockedReason: 'error',
      blockedMessage: message,
      blockedSequence: null,
    });
  } finally {
    await remoteDb.$client.end({ timeout: 1 });
  }
}
