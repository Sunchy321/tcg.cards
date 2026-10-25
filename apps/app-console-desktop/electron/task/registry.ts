/** Metadata and a lazy Worker-side loader for one task type. */
export interface TaskRegistration {
  taskType:       string;
  label:          string;
  version:        string;
  supportsResume: boolean;
  /** Present when starting this task type requires remote publish admission first. */
  admission?:     { game: 'magic' | 'hearthstone' | 'yugioh' | 'shadowverse' };
  scope(params: Record<string, unknown>): { type: string, key: string, snapshot?: Record<string, unknown> };
  load(): Promise<{ default: TaskDefinition }>;
}

/** Resume contracts a stage can declare for its stop boundaries. */
export type TaskStageResumeMode = 'none' | 'durable' | 'session_bound';

/** One planned stage executed entirely inside a Worker. */
export interface TaskStageDefinition {
  key:         string;
  label:       string;
  total:       number;
  /** Whether persisted stage progress is a checkpoint that survives a restart; defaults to none. */
  resumeMode?: TaskStageResumeMode;
  run(context: TaskStageContext): Promise<void>;
}

/** The Worker-side context for one stage. */
export interface TaskStageContext {
  params:  Record<string, unknown>;
  signal:  AbortSignal;
  progress(done: number): Promise<void>;
  /** Present when the stage re-enters after a pause; done is the persisted stage progress. */
  resume?: { done: number };
}

/** The Worker-side task definition. */
export interface TaskDefinition {
  stages(params: Record<string, unknown>): Promise<TaskStageDefinition[]> | TaskStageDefinition[];
  result?(params: Record<string, unknown>): Record<string, unknown>;
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
