import type { TaskStore } from './store';
import type { TaskScheduler } from './scheduler';
import { runtimeBootId } from './runtime';

/** Describes the cleanup surface used during startup and periodic inspection. */
export interface TaskCleanup {
  cleanupStartupState(): Promise<void>;
  runPeriodicSweep(): Promise<void>;
}

/** Statuses whose executors are definitely dead after a runtime restart. */
const staleExecutorStatuses: readonly string[] = [
  'running',
  'pausing',
  'resuming',
  'canceling',
];

/** Builds one startup-cleanup and periodic-sweep handler for the task framework. */
export function createTaskCleanup(
  store: TaskStore,
  _scheduler: TaskScheduler,
): TaskCleanup {
  return {
    async cleanupStartupState() {
      const active = await store.listActiveTaskRuns();

      for (const run of active) {
        // Tasks with an actively running executor from a previous boot are stale
        if (staleExecutorStatuses.includes(run.status)) {
          await store.updateTaskRun(run.id, {
            status: 'abandoned',
            terminalReason: 'abandoned_stale_run',
            finishedAt: new Date(),
            controlRequestKind: null,
            currentStageKey: null,
            currentStageIndex: null,
            currentResumeMode: null,
            pausedResumeMode: null,
          }).catch(() => {});
          continue;
        }

        // session_bound paused tasks from a previous boot cannot be resumed
        if (run.status === 'paused' && run.pausedResumeMode === 'session_bound' && run.runtimeBootId !== runtimeBootId) {
          await store.updateTaskRun(run.id, {
            status: 'abandoned',
            terminalReason: 'abandoned_stale_run',
            finishedAt: new Date(),
            controlRequestKind: null,
            currentStageKey: null,
            currentStageIndex: null,
            currentResumeMode: null,
            pausedResumeMode: null,
          }).catch(() => {});
        }
      }
    },

    async runPeriodicSweep() {
      // Reuses the same logic — each boot is a fresh "startup" for sweep purposes
      await this.cleanupStartupState();
    },
  };
}
