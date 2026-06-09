import type { PublishReport } from './hsdata-publish';

/** Desktop hsdata publish phases exposed to the frontend progress UI. */
export type PublishPhase =
  | 'loading_snapshots'
  | 'building_diff'
  | 'applying_remote'
  | 'finalizing'
  | 'completed'
  | 'failed';

/** Publish progress payload streamed to the frontend. */
export interface PublishJobProgressEvent {
  batchId: string;
  publishType: string;
  publishTargetId: string;
  phase: PublishPhase | string;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  totalRowCount: number | null;
  completedRowCount: number | null;
  report: PublishReport | null;
}

/** Publish job snapshot held in memory. */
export interface PublishJobState {
  batchId: string;
  publishType: string;
  publishTargetId: string;
  progress: PublishJobProgressEvent;
  updatedAt: string;
}

/** Subscriber callback invoked when one progress event snapshot changes. */
interface ProgressSubscriber<T> {
  publish: (event: T) => void;
}

let currentJob: PublishJobState | null = null;
const subscribers = new Set<ProgressSubscriber<PublishJobProgressEvent>>();

function isTerminalPhase(phase: PublishPhase | string): boolean {
  return phase === 'completed' || phase === 'failed';
}

function notifySubscribers(event: PublishJobProgressEvent): void {
  for (const subscriber of subscribers) {
    subscriber.publish(event);
  }
}

/** Streams progress snapshots and closes after a terminal phase. */
async function* streamPublishProgress(): AsyncGenerator<PublishJobProgressEvent> {
  const queue: PublishJobProgressEvent[] = [];
  let wake: (() => void) | null = null;
  let stopped = false;

  const push = (event: PublishJobProgressEvent) => {
    if (stopped) {
      return;
    }

    queue.push(event);

    if (wake) {
      const resolve = wake;
      wake = null;
      resolve();
    }
  };

  const subscriber: ProgressSubscriber<PublishJobProgressEvent> = { publish: push };
  subscribers.add(subscriber);
  const unsubscribe = () => { subscribers.delete(subscriber); };

  if (currentJob) {
    push(currentJob.progress);
  }

  try {
    while (!stopped) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }

      while (queue.length > 0) {
        const event = queue.shift()!;
        yield event;

        if (isTerminalPhase(event.phase)) {
          return;
        }
      }
    }
  } finally {
    stopped = true;
    if (wake) {
      wake();
    }
    unsubscribe();
  }
}

/** Starts a publish job entry and stores its first progress payload. */
export function startPublishJob(input: {
  publishType: string;
  publishTargetId: string;
  totalRowCount?: number | null;
}): PublishJobState {
  const batchId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const progress: PublishJobProgressEvent = {
    batchId,
    publishType: input.publishType,
    publishTargetId: input.publishTargetId,
    phase: 'loading_snapshots',
    message: '正在加载本地快照...',
    startedAt,
    phaseStartedAt: startedAt,
    finishedAt: null,
    totalRowCount: input.totalRowCount ?? null,
    completedRowCount: 0,
    report: null,
  };

  const state: PublishJobState = {
    batchId,
    publishType: input.publishType,
    publishTargetId: input.publishTargetId,
    progress,
    updatedAt: new Date().toISOString(),
  };

  currentJob = state;
  notifySubscribers(state.progress);

  return state;
}

/** Updates the current publish job with the next partial progress payload. */
export function updatePublishJob(patch: {
  phase?: PublishPhase | string;
  message?: string;
  totalRowCount?: number | null;
  completedRowCount?: number | null;
  report?: PublishReport | null;
}): void {
  if (!currentJob) {
    return;
  }

  const now = new Date().toISOString();
  const phaseChanged = patch.phase != null && patch.phase !== currentJob.progress.phase;

  const progress: PublishJobProgressEvent = {
    ...currentJob.progress,
    phase: patch.phase ?? currentJob.progress.phase,
    message: patch.message ?? currentJob.progress.message,
    totalRowCount: patch.totalRowCount !== undefined ? patch.totalRowCount : currentJob.progress.totalRowCount,
    completedRowCount: patch.completedRowCount !== undefined ? patch.completedRowCount : currentJob.progress.completedRowCount,
    report: patch.report !== undefined ? patch.report : currentJob.progress.report,
    finishedAt: patch.phase != null && isTerminalPhase(patch.phase) ? now : currentJob.progress.finishedAt,
    phaseStartedAt: phaseChanged ? now : currentJob.progress.phaseStartedAt,
  };

  currentJob = {
    ...currentJob,
    progress,
    updatedAt: now,
  };

  notifySubscribers(progress);
}

/** Returns the currently running publish job, or null if no job is active. */
export function getCurrentPublishJob(): PublishJobState | null {
  return currentJob;
}

/** Async generator that streams publish progress events until completed or failed. */
export function watchPublishJob(): AsyncGenerator<PublishJobProgressEvent> {
  return streamPublishProgress();
}
