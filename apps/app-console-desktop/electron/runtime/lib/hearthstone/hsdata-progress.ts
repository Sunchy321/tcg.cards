/** One writing segment mirrored into projection reports. */
export interface HsdataProjectWriteSegment {
  totalRowCount:     number;
  completedRowCount: number;
}

/** Writing breakdown accumulated by projection tasks. */
export interface HsdataProjectWriteBreakdown {
  entity:             HsdataProjectWriteSegment;
  localization:       HsdataProjectWriteSegment;
  latest:             HsdataProjectWriteSegment;
  relation:           HsdataProjectWriteSegment;
  card:               HsdataProjectWriteSegment;
  entityDelete:       HsdataProjectWriteSegment;
  localizationDelete: HsdataProjectWriteSegment;
  relationDelete:     HsdataProjectWriteSegment;
}

/** Projection reconciliation counts accumulated by projection tasks. */
export interface HsdataProjectReconciledCounts {
  reusedEntities:        number;
  reusedLocalizations:   number;
  reusedRelations:       number;
  insertedEntities:      number;
  insertedLocalizations: number;
  insertedRelations:     number;
  updatedEntities:       number;
  updatedLocalizations:  number;
  updatedRelations:      number;
}

/** Subscriber callback invoked when one progress event snapshot changes. */
interface ProgressSubscriber<T> {
  publish: (event: T) => void;
}

/** Streams progress snapshots and closes after a terminal phase. */
async function* streamProgressEvents<TEvent extends { phase: string }>(
  currentState: () => TEvent | null,
  subscribe: (subscriber: ProgressSubscriber<TEvent>) => () => void,
  isTerminalPhase: (phase: string) => boolean,
): AsyncGenerator<TEvent> {
  const queue: TEvent[] = [];
  let wake: (() => void) | null = null;
  let stopped = false;

  const push = (event: TEvent) => {
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

  const unsubscribe = subscribe({ publish: push });
  const initial = currentState();
  if (initial) {
    push(initial);
  }

  try {
    while (!stopped) {
      if (queue.length === 0) {
        await new Promise<void>(resolve => {
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

/** Desktop recompute-latest phases exposed to the frontend progress UI. */
export type HsdataRecomputeLatestPhase
  = | 'entity'
    | 'localization'
    | 'relation'
    | 'completed'
    | 'failed';

/** Recompute-latest progress event pushed to the frontend streaming subscriber. */
export interface HsdataRecomputeLatestProgressEvent {
  phase:             HsdataRecomputeLatestPhase | string;
  message:           string;
  startedAt:         string;
  phaseStartedAt:    string;
  finishedAt:        string | null;
  totalRowCount:     number | null;
  completedRowCount: number | null;
  updatedCount:      number | null;
}

/** Recompute-latest job snapshot stored in-memory for streaming subscribers. */
export interface HsdataRecomputeLatestJobState {
  progress:  HsdataRecomputeLatestProgressEvent;
  updatedAt: string;
}

const recomputeLatestSubscribers = new Set<ProgressSubscriber<HsdataRecomputeLatestProgressEvent>>();
let recomputeLatestJob: HsdataRecomputeLatestJobState | null = null;

/** Identifies terminal phases that close the recompute-latest stream. */
function isRecomputeLatestTerminalPhase(phase: HsdataRecomputeLatestPhase | string): boolean {
  return phase === 'completed' || phase === 'failed';
}

/** Publishes recompute-latest progress to every active subscriber. */
function publishRecomputeLatest(event: HsdataRecomputeLatestProgressEvent): void {
  for (const subscriber of recomputeLatestSubscribers) {
    subscriber.publish(event);
  }
}

/** Starts a new recompute-latest job and publishes its initial progress event. */
export function startRecomputeLatestJob(input: {
  message:       string;
  totalRowCount: number | null;
}): HsdataRecomputeLatestJobState {
  const startedAt = new Date().toISOString();
  const progress: HsdataRecomputeLatestProgressEvent = {
    phase:             'entity',
    message:           input.message,
    startedAt,
    phaseStartedAt:    startedAt,
    finishedAt:        null,
    totalRowCount:     input.totalRowCount,
    completedRowCount: 0,
    updatedCount:      null,
  };

  const state: HsdataRecomputeLatestJobState = { progress, updatedAt: new Date().toISOString() };
  recomputeLatestJob = state;
  publishRecomputeLatest(state.progress);
  return state;
}

/** Updates the current recompute-latest job progress and publishes to subscribers. */
export function updateRecomputeLatestJob(
  patch: Partial<HsdataRecomputeLatestProgressEvent>,
): HsdataRecomputeLatestJobState | null {
  if (!recomputeLatestJob) {
    return null;
  }

  const now = new Date().toISOString();
  const nextPhase = patch.phase ?? recomputeLatestJob.progress.phase;
  const phaseStartedAt = patch.phase && patch.phase !== recomputeLatestJob.progress.phase
    ? now
    : patch.phaseStartedAt ?? recomputeLatestJob.progress.phaseStartedAt;
  const finishedAt = isRecomputeLatestTerminalPhase(nextPhase)
    ? patch.finishedAt ?? recomputeLatestJob.progress.finishedAt ?? now
    : patch.finishedAt ?? null;

  const nextState: HsdataRecomputeLatestJobState = {
    updatedAt: now,
    progress:  {
      ...recomputeLatestJob.progress,
      ...patch,
      startedAt: recomputeLatestJob.progress.startedAt,
      phaseStartedAt,
      finishedAt,
    },
  };

  recomputeLatestJob = nextState;
  publishRecomputeLatest(nextState.progress);
  return nextState;
}

/** Returns the current recompute-latest job snapshot, or null if none is active. */
export function getRecomputeLatestJob(): HsdataRecomputeLatestJobState | null {
  return recomputeLatestJob;
}

/** Streams recompute-latest progress events until the job reaches a terminal phase. */
export function watchRecomputeLatestJob(): AsyncGenerator<HsdataRecomputeLatestProgressEvent> {
  return streamProgressEvents(
    () => getRecomputeLatestJob()?.progress ?? null,
    subscriber => {
      recomputeLatestSubscribers.add(subscriber);
      return () => {
        recomputeLatestSubscribers.delete(subscriber);
      };
    },
    isRecomputeLatestTerminalPhase,
  );
}
