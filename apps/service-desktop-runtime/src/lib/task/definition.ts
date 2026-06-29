/** Distinguishes whether one task block commits inside one consistency boundary. */
export type TaskEffectModel = 'atomic' | 'reconcilable';

/** Minimal store surface needed by executeBlock. */
export interface TaskExecuteStore {
  updateStage(taskRunId: string, stageKey: string, patch: Record<string, unknown>): Promise<TaskStageState>;
  publishSnapshot?(): Promise<void>;
}

/** Describes the progress representation used by one stage. */
export type TaskProgressMode = 'bounded' | 'unbound' | 'simple';

/** Describes the resume contract exposed by one stage boundary. */
export type TaskResumeMode = 'none' | 'durable' | 'session_bound';

/** Identifies one business scope that a task run operates on. */
export interface TaskScope {
  type: string;
  key: string;
  snapshot?: Record<string, unknown>;
}

/** Captures the immutable creation input stored on one task run. */
export interface TaskRunInput {
  taskType: string;
  definitionVersion: string;
  scope: TaskScope;
  params: Record<string, unknown>;
}

/** Declares one stage skeleton created together with a task run. */
export interface TaskStagePlan {
  stageKey: string;
  stageIndex: number;
  label: string;
  progressMode: TaskProgressMode;
  resumeMode: TaskResumeMode;
}

/** Carries one persisted stage snapshot into task-defined planning hooks. */
export interface TaskStageState extends TaskStagePlan {
  status: 'pending' | 'running' | 'paused' | 'canceled' | 'failed' | 'completed' | 'abandoned';
  total: number | null;
  done: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** May be set on updateStage calls to pass transient segments to event streams. */
  segments?: { name: string; done: number; total: number }[] | null;
  resumeToken: Record<string, unknown> | null;
  selectionAnchor: Record<string, unknown> | null;
}

/** Describes one runnable block produced inside one current task stage. */
export interface TaskBlock {
  blockKey: string;
  effectModel?: TaskEffectModel;
  payload?: Record<string, unknown>;
}

/** Summarizes one stage entry prepared before the executor durable-enters it. */
export interface TaskStageEntry {
  stageKey: string;
  stageIndex: number;
  progressMode: TaskProgressMode;
  resumeMode: TaskResumeMode;
  total: number | null;
  selectionAnchor: Record<string, unknown> | null;
}

/** Supplies the task-defined planner and executor hooks for one task type. */
export interface TaskDefinition {
  taskType: string;
  definitionVersion: string;
  supportsResume: boolean;
  effectModel: TaskEffectModel;
  buildStagePlan(input: TaskRunInput): Promise<TaskStagePlan[]> | TaskStagePlan[];
  prepareStageEntry(input: {
    run: TaskRunInput;
    stage: TaskStageState;
    resume: boolean;
    taskRunId: string;
  }): Promise<TaskStageEntry> | TaskStageEntry;
  buildBlocks(input: {
    run: TaskRunInput;
    stage: TaskStageState;
    taskRunId: string;
  }): AsyncIterable<TaskBlock> | Iterable<TaskBlock>;
  executeBlock(input: {
    run: TaskRunInput;
    stage: TaskStageState;
    block: TaskBlock;
    store: TaskExecuteStore;
    taskRunId: string;
  }): Promise<void> | void;
}
