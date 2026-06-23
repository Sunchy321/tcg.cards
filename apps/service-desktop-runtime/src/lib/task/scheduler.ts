import type { TaskStore, TaskRunRecord } from './store';

/** Captures one waiting task candidate that the scheduler may try to claim. */
export interface TaskScheduleCandidate {
  run: TaskRunRecord;
  reason: 'pending' | 'resuming';
}

/** Describes the scheduler surface used by control paths and background loops. */
export interface TaskScheduler {
  listCandidates(): Promise<TaskScheduleCandidate[]>;
  trigger(): Promise<void>;
}

/** Builds one not-yet-implemented task scheduler placeholder. */
export function createTaskScheduler(_store: TaskStore): TaskScheduler {
  return {
    async listCandidates() {
      throw new Error('Task scheduler candidate listing is not implemented yet');
    },
    async trigger() {
      throw new Error('Task scheduler trigger is not implemented yet');
    },
  };
}
