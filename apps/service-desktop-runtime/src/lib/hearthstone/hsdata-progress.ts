/** Desktop hsdata import phases exposed to the frontend progress UI. */
export type HsdataImportPhase =
  | 'reading_source'
  | 'parsing_entities'
  | 'writing_batches'
  | 'finalizing_source_tag'
  | 'completed'
  | 'failed';

/** Desktop hsdata projection phases exposed to the frontend progress UI. */
export type HsdataProjectPhase =
  | 'loading_snapshots'
  | 'loading_tags'
  | 'projecting_snapshots'
  | 'summarizing_changes'
  | 'writing_rows'
  | 'completed'
  | 'failed';

/** One writing segment mirrored into the frontend stacked progress bar. */
export interface HsdataProjectWriteSegment {
  totalRowCount: number;
  completedRowCount: number;
}

/** Writing breakdown mirrored into the frontend stacked progress bar. */
export interface HsdataProjectWriteBreakdown {
  entity:       HsdataProjectWriteSegment;
  localization: HsdataProjectWriteSegment;
  latest:       HsdataProjectWriteSegment;
  relation:     HsdataProjectWriteSegment;
  card:         HsdataProjectWriteSegment;
}

/** Import progress payload mirrored by the frontend runtime polling adapter. */
export interface HsdataImportProgressEvent {
  sourceId: string;
  sourceTag: number | null;
  jobId: string | null;
  phase: HsdataImportPhase | string;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  totalBatchCount: number | null;
  completedBatchCount: number | null;
  totalEntityCount: number | null;
  completedEntityCount: number | null;
  currentBatchIndex: number | null;
  totalWorkCount: number | null;
  completedWorkCount: number | null;
  workLabel: string | null;
}

/** Projection progress payload mirrored by the frontend runtime polling adapter. */
export interface HsdataProjectProgressEvent {
  sourceTag: number;
  phase: HsdataProjectPhase | string;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  totalSnapshotCount: number | null;
  completedSnapshotCount: number | null;
  totalWorkCount: number | null;
  completedWorkCount: number | null;
  workLabel: string | null;
  writeBreakdown: HsdataProjectWriteBreakdown | null;
}

/** Import job snapshot returned to polling callers. */
export interface HsdataImportJobState {
  jobId: string;
  sourceId: string;
  sourceTag: number | null;
  progress: HsdataImportProgressEvent;
  updatedAt: string;
}

/** Projection job snapshot returned to polling callers. */
export interface HsdataProjectJobState {
  sourceTag: number;
  progress: HsdataProjectProgressEvent;
  updatedAt: string;
}

/** Subscriber callback invoked when one progress event snapshot changes. */
interface ProgressSubscriber<T> {
  publish: (event: T) => void;
}

const importJobsById = new Map<string, HsdataImportJobState>();
const importJobIdBySourceId = new Map<string, string>();
const projectJobsBySourceTag = new Map<number, HsdataProjectJobState>();
const importSubscribersBySourceId = new Map<string, Set<ProgressSubscriber<HsdataImportProgressEvent>>>();
const projectSubscribersBySourceTag = new Map<number, Set<ProgressSubscriber<HsdataProjectProgressEvent>>>();

/** Identifies terminal phases that can close one import progress stream. */
function isImportTerminalPhase(phase: HsdataImportPhase | string): boolean {
  return phase === 'completed' || phase === 'failed';
}

/** Identifies terminal phases that can close one projection progress stream. */
function isProjectTerminalPhase(phase: HsdataProjectPhase | string): boolean {
  return phase === 'completed' || phase === 'failed';
}

/** Registers one subscriber under a keyed bucket and returns the matching cleanup. */
function subscribeToBucket<TKey, TEvent>(
  buckets: Map<TKey, Set<ProgressSubscriber<TEvent>>>,
  key: TKey,
  subscriber: ProgressSubscriber<TEvent>,
): () => void {
  const subscribers = buckets.get(key) ?? new Set<ProgressSubscriber<TEvent>>();
  subscribers.add(subscriber);
  buckets.set(key, subscribers);

  return () => {
    const current = buckets.get(key);
    if (!current) {
      return;
    }

    current.delete(subscriber);

    if (current.size === 0) {
      buckets.delete(key);
    }
  };
}

/** Broadcasts one progress snapshot to all subscribers of the same keyed bucket. */
function publishToBucket<TKey, TEvent>(
  buckets: Map<TKey, Set<ProgressSubscriber<TEvent>>>,
  key: TKey,
  event: TEvent,
): void {
  const subscribers = buckets.get(key);
  if (!subscribers) {
    return;
  }

  for (const subscriber of subscribers) {
    subscriber.publish(event);
  }
}

/** Streams progress snapshots for one task key and closes after a terminal phase. */
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

/** Starts one import job entry and stores its first progress payload. */
export const startImportJob = (input: {
  sourceId: string;
  sourceTag: number | null;
  message: string;
  totalBatchCount?: number | null;
  totalEntityCount?: number | null;
}) => {
  const jobId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const progress: HsdataImportProgressEvent = {
    sourceId:              input.sourceId,
    sourceTag:             input.sourceTag,
    jobId,
    phase:                 'reading_source',
    message:               input.message,
    startedAt,
    phaseStartedAt:        startedAt,
    finishedAt:            null,
    totalBatchCount:       input.totalBatchCount ?? null,
    completedBatchCount:   0,
    totalEntityCount:      input.totalEntityCount ?? null,
    completedEntityCount:  0,
    currentBatchIndex:     null,
    totalWorkCount:        null,
    completedWorkCount:    null,
    workLabel:             null,
  };

  const state: HsdataImportJobState = {
    jobId,
    sourceId: input.sourceId,
    sourceTag: input.sourceTag,
    progress,
    updatedAt: new Date().toISOString(),
  };

  importJobsById.set(jobId, state);
  importJobIdBySourceId.set(input.sourceId, jobId);
  publishToBucket(importSubscribersBySourceId, input.sourceId, state.progress);

  return state;
};

/** Updates one import job with the next partial progress payload. */
export const updateImportJob = (
  jobId: string,
  patch: Partial<Omit<HsdataImportProgressEvent, 'jobId'>>,
) => {
  const state = importJobsById.get(jobId);
  if (!state) {
    return null;
  }

  const now = new Date().toISOString();
  const nextPhase = patch.phase ?? state.progress.phase;
  const phaseStartedAt = patch.phase && patch.phase !== state.progress.phase
    ? now
    : patch.phaseStartedAt ?? state.progress.phaseStartedAt;
  const finishedAt = isImportTerminalPhase(nextPhase)
    ? patch.finishedAt ?? state.progress.finishedAt ?? now
    : patch.finishedAt ?? null;
  const nextState: HsdataImportJobState = {
    ...state,
    sourceId:   patch.sourceId ?? state.sourceId,
    sourceTag:  patch.sourceTag ?? state.sourceTag,
    updatedAt:  now,
    progress: {
      ...state.progress,
      ...patch,
      jobId,
      startedAt:      state.progress.startedAt,
      phaseStartedAt,
      finishedAt,
    },
  };

  importJobsById.set(jobId, nextState);
  importJobIdBySourceId.set(nextState.sourceId, jobId);
  publishToBucket(importSubscribersBySourceId, nextState.sourceId, nextState.progress);

  return nextState;
};

/** Resolves the latest import job snapshot for one source id. */
export const getImportJobBySourceId = (sourceId: string) => {
  const jobId = importJobIdBySourceId.get(sourceId);
  return jobId ? importJobsById.get(jobId) ?? null : null;
};

/** Streams the latest import progress for one source id until the job reaches a terminal phase. */
export function watchImportJobBySourceId(sourceId: string): AsyncGenerator<HsdataImportProgressEvent> {
  return streamProgressEvents(
    () => getImportJobBySourceId(sourceId)?.progress ?? null,
    subscriber => subscribeToBucket(importSubscribersBySourceId, sourceId, subscriber),
    isImportTerminalPhase,
  );
}

/** Starts or replaces the current projection job snapshot for one source tag. */
export const startProjectJob = (input: {
  sourceTag: number;
  message: string;
  totalSnapshotCount?: number | null;
}) => {
  const startedAt = new Date().toISOString();
  const progress: HsdataProjectProgressEvent = {
    sourceTag:               input.sourceTag,
    phase:                   'loading_snapshots',
    message:                 input.message,
    startedAt,
    phaseStartedAt:          startedAt,
    finishedAt:              null,
    totalSnapshotCount:      input.totalSnapshotCount ?? null,
    completedSnapshotCount:  0,
    totalWorkCount:          null,
    completedWorkCount:      null,
    workLabel:               null,
    writeBreakdown:          null,
  };

  const state: HsdataProjectJobState = {
    sourceTag: input.sourceTag,
    progress,
    updatedAt: new Date().toISOString(),
  };

  projectJobsBySourceTag.set(input.sourceTag, state);
  publishToBucket(projectSubscribersBySourceTag, input.sourceTag, state.progress);

  return state;
};

/** Updates the latest projection job snapshot for one source tag. */
export const updateProjectJob = (
  sourceTag: number,
  patch: Partial<HsdataProjectProgressEvent>,
) => {
  const state = projectJobsBySourceTag.get(sourceTag);
  if (!state) {
    return null;
  }

  const now = new Date().toISOString();
  const nextPhase = patch.phase ?? state.progress.phase;
  const phaseStartedAt = patch.phase && patch.phase !== state.progress.phase
    ? now
    : patch.phaseStartedAt ?? state.progress.phaseStartedAt;
  const finishedAt = isProjectTerminalPhase(nextPhase)
    ? patch.finishedAt ?? state.progress.finishedAt ?? now
    : patch.finishedAt ?? null;
  const nextState: HsdataProjectJobState = {
    sourceTag,
    updatedAt: now,
    progress: {
      ...state.progress,
      ...patch,
      sourceTag,
      startedAt:      state.progress.startedAt,
      phaseStartedAt,
      finishedAt,
    },
  };

  projectJobsBySourceTag.set(sourceTag, nextState);
  publishToBucket(projectSubscribersBySourceTag, sourceTag, nextState.progress);
  return nextState;
};

/** Resolves the latest projection job snapshot for one source tag. */
export const getProjectJobBySourceTag = (sourceTag: number) => {
  return projectJobsBySourceTag.get(sourceTag) ?? null;
};

/** Streams the latest projection progress for one source tag until the job reaches a terminal phase. */
export function watchProjectJobBySourceTag(sourceTag: number): AsyncGenerator<HsdataProjectProgressEvent> {
  return streamProgressEvents(
    () => getProjectJobBySourceTag(sourceTag)?.progress ?? null,
    subscriber => subscribeToBucket(projectSubscribersBySourceTag, sourceTag, subscriber),
    isProjectTerminalPhase,
  );
}
