/** Desktop image job phases exposed to the frontend polling UI. */
export type ImageJobPhase =
  | 'exporting_requirements'
  | 'submitting_renderer_job'
  | 'importing_local_bucket'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed';

/** Filters snapshot stored alongside one submitted desktop image job. */
export interface ImageJobFilters {
  lang: string;
  version: number | null;
  cardId: string | null;
  zones: string[];
  templates: string[];
  premiums: string[];
  limit: number;
  cursor: string | null;
  scanAll: boolean;
}

/** One image job snapshot returned to desktop polling callers. */
export interface ImageJobState {
  jobId: string;
  phase: ImageJobPhase;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  filters: ImageJobFilters;
  exportId: string | null;
  requestCount: number | null;
  totalCount: number | null;
  remainingEstimate: number | null;
  rendererJobId: string | null;
  requirementContent: string | null;
  requirementName: string | null;
  rendererStatus: string | null;
  completedCount: number | null;
  missingCount: number | null;
  rejectedCount: number | null;
  writtenCount: number | null;
  skippedCount: number | null;
  errorMessage: string | null;
  rejectedLogPath: string | null;
  /** Overall total across all batches in scanAll mode. */
  overallTotalCount: number | null;
  /** Overall completed count across all batches in scanAll mode. */
  overallCompletedCount: number | null;
  /** Overall rejected count across all batches in scanAll mode. */
  overallRejectedCount: number | null;
  /** Current batch index (1-based) in scanAll mode. */
  currentBatchIndex: number | null;
  /** Estimated total batches in scanAll mode. */
  totalBatches: number | null;
}

/** Lightweight progress event pushed to the frontend via the event iterator stream. */
export interface ImageJobProgressEvent {
  phase: ImageJobPhase | string;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  completedCount: number | null;
  totalCount: number | null;
  writtenCount: number | null;
  skippedCount: number | null;
  rejectedCount: number | null;
  errorMessage: string | null;
  rejectedLogPath: string | null;
  overallTotalCount: number | null;
  overallCompletedCount: number | null;
  overallRejectedCount: number | null;
  currentBatchIndex: number | null;
  totalBatches: number | null;
}

interface ImageProgressSubscriber {
  publish: (event: ImageJobProgressEvent) => void;
}

let currentImageJob: ImageJobState | null = null;
let currentJobController: JobController | null = null;
const imageJobSubscribers = new Set<ImageProgressSubscriber>();

function isTerminalPhase(phase: ImageJobPhase | string): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'stopped';
}

/** Per-job controller for signalling pause/stop from the RPC layer into the running render coroutine. */
export class JobController {
  private _shouldPause = false;
  private _shouldStop = false;
  private _abortController = new AbortController();

  get shouldPause(): boolean { return this._shouldPause; }
  get shouldStop(): boolean { return this._shouldStop; }
  get signal(): AbortSignal { return this._abortController.signal; }

  requestPause(): void { this._shouldPause = true; }
  requestStop(): void {
    this._shouldStop = true;
    this._abortController.abort();
  }
}

function buildProgressFromJob(state: ImageJobState): ImageJobProgressEvent {
  return {
    phase:                state.phase,
    message:              state.message,
    startedAt:            state.startedAt,
    phaseStartedAt:       state.phaseStartedAt,
    finishedAt:           state.finishedAt,
    completedCount:       state.completedCount,
    totalCount:           state.totalCount,
    writtenCount:         state.writtenCount,
    skippedCount:         state.skippedCount,
    rejectedCount:        state.rejectedCount,
    errorMessage:         state.errorMessage,
    rejectedLogPath:      state.rejectedLogPath,
    overallTotalCount:    state.overallTotalCount,
    overallCompletedCount: state.overallCompletedCount,
    overallRejectedCount:  state.overallRejectedCount,
    currentBatchIndex:     state.currentBatchIndex,
    totalBatches:          state.totalBatches,
  };
}

function notifySubscribers(event: ImageJobProgressEvent) {
  for (const subscriber of imageJobSubscribers) {
    subscriber.publish(event);
  }
}

/** Subscribes to image job progress events. Returns an unsubscribe function. */
export function subscribeImageJob(subscriber: ImageProgressSubscriber): () => void {
  imageJobSubscribers.add(subscriber);
  return () => { imageJobSubscribers.delete(subscriber); };
}

/** Async generator that yields image job progress events until the job is terminal. */
export async function* watchImageJob(): AsyncGenerator<ImageJobProgressEvent> {
  const queue: ImageJobProgressEvent[] = [];
  let wake: (() => void) | null = null;
  let stopped = false;

  const push = (event: ImageJobProgressEvent) => {
    if (stopped) return;
    queue.push(event);
    if (wake) { const resolve = wake; wake = null; resolve(); }
  };

  const unsubscribe = subscribeImageJob({ publish: push });
  const initial = currentImageJob;
  if (initial) push(buildProgressFromJob(initial));

  try {
    while (!stopped) {
      if (queue.length === 0) {
        await new Promise<void>(resolve => { wake = resolve; });
      }
      while (queue.length > 0) {
        const event = queue.shift()!;
        yield event;
        if (isTerminalPhase(event.phase)) return;
      }
    }
  } finally {
    stopped = true;
    if (wake) wake();
    unsubscribe();
  }
}

/** Starts one new image job snapshot and stores it as the current desktop task. */
export function startImageJob(input: {
  message: string;
  filters: ImageJobFilters;
}) {
  const now = new Date().toISOString();
  const state: ImageJobState = {
    jobId: crypto.randomUUID(),
    phase: 'exporting_requirements',
    message: input.message,
    startedAt: now,
    phaseStartedAt: now,
    finishedAt: null,
    updatedAt: now,
    filters: input.filters,
    exportId: null,
    requestCount: null,
    totalCount: null,
    remainingEstimate: null,
    rendererJobId: null,
    requirementContent: null,
    requirementName: null,
    rendererStatus: null,
    completedCount: null,
    missingCount: null,
    rejectedCount: null,
    writtenCount: null,
    skippedCount: null,
    errorMessage: null,
    rejectedLogPath: null,
    overallTotalCount: null,
    overallCompletedCount: null,
    overallRejectedCount: null,
    currentBatchIndex: null,
    totalBatches: null,
  };

  currentImageJob = state;
  return state;
}

/** Updates the current image job snapshot with the next partial payload. */
export function updateImageJob(
  jobId: string,
  patch: Partial<Omit<ImageJobState, 'jobId' | 'startedAt' | 'filters'>>,
) {
  const state = currentImageJob;

  if (state == null || state.jobId !== jobId) {
    return null;
  }

  const now = new Date().toISOString();
  const nextPhase = patch.phase ?? state.phase;
  const phaseStartedAt = patch.phase && patch.phase !== state.phase
    ? now
    : patch.phaseStartedAt ?? state.phaseStartedAt;
  const finishedAt = isTerminalPhase(nextPhase)
    ? patch.finishedAt ?? state.finishedAt ?? now
    : patch.finishedAt ?? null;
  const nextState: ImageJobState = {
    ...state,
    ...patch,
    jobId,
    startedAt: state.startedAt,
    filters: state.filters,
    updatedAt: now,
    phaseStartedAt,
    finishedAt,
  };

  currentImageJob = nextState;
  notifySubscribers(buildProgressFromJob(nextState));
  return nextState;
}

/** Creates a new JobController for the current job. */
export function createJobController(): JobController {
  currentJobController = new JobController();
  return currentJobController;
}

/** Returns the current JobController or null. */
export function getJobController(): JobController | null {
  return currentJobController;
}

/** Clears the current JobController. */
export function clearJobController(): void {
  currentJobController = null;
}

/** Requests a pause of the current job. The running coroutine detects this and saves partial progress. */
export function pauseImageJob(): ImageJobState | null {
  if (currentImageJob == null || isTerminalPhase(currentImageJob.phase)) return null;
  currentJobController?.requestPause();
  return currentImageJob;
}

/** Requests a stop of the current job. The running coroutine aborts in-flight work and saves partial progress. */
export function stopImageJob(): ImageJobState | null {
  if (currentImageJob == null || isTerminalPhase(currentImageJob.phase)) return null;
  currentJobController?.requestStop();
  return currentImageJob;
}

/** Validates that the current job is paused and resets the controller for resume. Returns the job if resumable. */
export function resumeImageJob(): ImageJobState | null {
  if (currentImageJob == null || currentImageJob.phase !== 'paused') return null;
  currentJobController = new JobController();
  return currentImageJob;
}

/** Returns the latest image job snapshot kept in runtime memory. */
export function getCurrentImageJob() {
  return currentImageJob;
}
