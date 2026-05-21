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

/** Import progress payload mirrored by the frontend runtime polling adapter. */
export interface HsdataImportProgressEvent {
  sourceId: string;
  sourceTag: number | null;
  jobId: string | null;
  phase: HsdataImportPhase | string;
  message: string;
  totalBatchCount: number | null;
  completedBatchCount: number | null;
  totalEntityCount: number | null;
  completedEntityCount: number | null;
  currentBatchIndex: number | null;
}

/** Projection progress payload mirrored by the frontend runtime polling adapter. */
export interface HsdataProjectProgressEvent {
  sourceTag: number;
  phase: HsdataProjectPhase | string;
  message: string;
  totalSnapshotCount: number | null;
  completedSnapshotCount: number | null;
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

const importJobsById = new Map<string, HsdataImportJobState>();
const importJobIdBySourceId = new Map<string, string>();
const projectJobsBySourceTag = new Map<number, HsdataProjectJobState>();

/** Starts one import job entry and stores its first progress payload. */
export const startImportJob = (input: {
  sourceId: string;
  sourceTag: number | null;
  message: string;
  totalBatchCount?: number | null;
  totalEntityCount?: number | null;
}) => {
  const jobId = crypto.randomUUID();
  const progress: HsdataImportProgressEvent = {
    sourceId:              input.sourceId,
    sourceTag:             input.sourceTag,
    jobId,
    phase:                 'reading_source',
    message:               input.message,
    totalBatchCount:       input.totalBatchCount ?? null,
    completedBatchCount:   0,
    totalEntityCount:      input.totalEntityCount ?? null,
    completedEntityCount:  0,
    currentBatchIndex:     null,
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

  const nextState: HsdataImportJobState = {
    ...state,
    sourceId:   patch.sourceId ?? state.sourceId,
    sourceTag:  patch.sourceTag ?? state.sourceTag,
    updatedAt:  new Date().toISOString(),
    progress: {
      ...state.progress,
      ...patch,
      jobId,
    },
  };

  importJobsById.set(jobId, nextState);
  importJobIdBySourceId.set(nextState.sourceId, jobId);

  return nextState;
};

/** Resolves the latest import job snapshot for one source id. */
export const getImportJobBySourceId = (sourceId: string) => {
  const jobId = importJobIdBySourceId.get(sourceId);
  return jobId ? importJobsById.get(jobId) ?? null : null;
};

/** Starts or replaces the current projection job snapshot for one source tag. */
export const startProjectJob = (input: {
  sourceTag: number;
  message: string;
  totalSnapshotCount?: number | null;
}) => {
  const progress: HsdataProjectProgressEvent = {
    sourceTag:               input.sourceTag,
    phase:                   'loading_snapshots',
    message:                 input.message,
    totalSnapshotCount:      input.totalSnapshotCount ?? null,
    completedSnapshotCount:  0,
  };

  const state: HsdataProjectJobState = {
    sourceTag: input.sourceTag,
    progress,
    updatedAt: new Date().toISOString(),
  };

  projectJobsBySourceTag.set(input.sourceTag, state);

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

  const nextState: HsdataProjectJobState = {
    sourceTag,
    updatedAt: new Date().toISOString(),
    progress: {
      ...state.progress,
      ...patch,
      sourceTag,
    },
  };

  projectJobsBySourceTag.set(sourceTag, nextState);
  return nextState;
};

/** Resolves the latest projection job snapshot for one source tag. */
export const getProjectJobBySourceTag = (sourceTag: number) => {
  return projectJobsBySourceTag.get(sourceTag) ?? null;
};
