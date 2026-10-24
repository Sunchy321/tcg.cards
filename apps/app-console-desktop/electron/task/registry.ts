/** Metadata and a lazy Worker-side loader for one task type. */
export interface TaskRegistration {
  taskType:       string;
  label:          string;
  version:        string;
  supportsResume: boolean;
  scope(params: Record<string, unknown>): { type: string, key: string, snapshot?: Record<string, unknown> };
  load(): Promise<{ default: TaskDefinition }>;
}

/** One planned stage executed entirely inside a Worker. */
export interface TaskStageDefinition {
  key:   string;
  label: string;
  total: number;
  run(context: TaskStageContext): Promise<void>;
}

/** The Worker-side context for one stage. */
export interface TaskStageContext {
  params: Record<string, unknown>;
  signal: AbortSignal;
  progress(done: number): Promise<void>;
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
