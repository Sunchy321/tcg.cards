import type { AdmissionGame, PublishConfirmation } from '../contract';

/** Metadata and a lazy Worker-side loader for one task type. */
export interface TaskRegistration {
  taskType:             string;
  label:                string;
  version:              string;
  supportsResume:       boolean;
  /** Present when starting this task type requires remote publish admission first. */
  admission?:           { game: AdmissionGame };
  /** Builds safe confirmation copy from launch parameters without exposing raw task data. */
  publishConfirmation?: (params: Record<string, unknown>) => PublishConfirmation | null;
  scope(params: Record<string, unknown>): { type: string, key: string, snapshot?: Record<string, unknown> };
  load?(): Promise<{ default: TaskDefinition }>;
}

/** Resume contracts a stage can declare for its stop boundaries. */
export type TaskStageResumeMode = 'none' | 'durable' | 'session_bound';
export type TaskProgressMode = 'bounded' | 'unbound' | 'simple';

/** One progress update from a task after a completed unit of work. */
export interface TaskProgressUpdate {
  done:      number | null;
  total?:    number | null;
  segments?: { name: string, done: number, total: number, color?: string }[];
}

/** A persisted stage checkpoint required to safely resume one task run. */
export interface TaskResumeState {
  done:  number | null;
  token: Record<string, unknown> | null;
}

/** Thrown only after a task has persisted a safe checkpoint. */
export class TaskBoundarySignal extends Error {
  constructor(readonly control: 'pause' | 'cancel' | 'shutdown') {
    super(`Task reached a ${control} boundary`);
    this.name = 'TaskBoundarySignal';
  }
}

/** One planned stage executed entirely inside a Worker. */
export interface TaskStageDefinition {
  key:           string;
  label:         string;
  total:         number | null;
  progressMode?: TaskProgressMode;
  /** Whether persisted stage progress is a checkpoint that survives a restart; defaults to none. */
  resumeMode?:   TaskStageResumeMode;
  run(context: TaskStageContext): Promise<void>;
}

/** The Worker-side context for one stage. */
export interface TaskStageContext {
  taskRunId: string;
  params:    Record<string, unknown>;
  signal:    AbortSignal;
  progress(update: number | TaskProgressUpdate): Promise<void>;
  /** Persists a domain checkpoint and settles pending controls at this safe boundary. */
  checkpoint(token: Record<string, unknown>, update?: TaskProgressUpdate): Promise<void>;
  /** Saves a task result so a completed stage can be restored after a restart. */
  saveResult(result: Record<string, unknown>): Promise<void>;
  /** Present when a stage re-enters with its persisted progress and domain checkpoint. */
  resume?:   TaskResumeState;
}

/** The Worker-side task definition. */
export interface TaskDefinition {
  stages(params: Record<string, unknown>): Promise<TaskStageDefinition[]> | TaskStageDefinition[];
  result?(params: Record<string, unknown>, taskRunId: string): Record<string, unknown>;
  onCanceled?(params: Record<string, unknown>, taskRunId: string): Promise<void> | void;
  cleanup?(taskRunId: string): void;
}

const registrations = new Map<string, TaskRegistration>();

/** Registers a task from its co-located lightweight registration module. */
export function registerTask(registration: TaskRegistration): void {
  if (registrations.has(registration.taskType)) {
    throw new Error(`Duplicate task type: ${registration.taskType}`);
  }
  registrations.set(registration.taskType, registration);
}

/** Resolves a task without importing its execution definition. */
export function getTask(taskType: string): TaskRegistration {
  const registration = registrations.get(taskType);
  if (!registration) throw new Error(`Unknown task type: ${taskType}`);
  return registration;
}

/** Looks a task up without throwing so boot recovery can classify unknown types. */
export function findTask(taskType: string): TaskRegistration | undefined {
  return registrations.get(taskType);
}
