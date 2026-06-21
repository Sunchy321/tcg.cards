import type { TaskStore } from './store';
import type { TaskScheduler } from './scheduler';

/** Describes the cleanup surface used during startup and periodic inspection. */
export interface TaskCleanup {
  cleanupStartupState(): Promise<void>;
  runPeriodicSweep(): Promise<void>;
}

/** Builds one not-yet-implemented cleanup placeholder for future wiring. */
export function createTaskCleanup(
  _store: TaskStore,
  _scheduler: TaskScheduler,
): TaskCleanup {
  return {
    async cleanupStartupState() {
      throw new Error('Task startup cleanup is not implemented yet');
    },
    async runPeriodicSweep() {
      throw new Error('Task periodic cleanup is not implemented yet');
    },
  };
}
