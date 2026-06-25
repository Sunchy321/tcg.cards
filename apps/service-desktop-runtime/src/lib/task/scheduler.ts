import type { TaskStore, TaskRunRecord } from './store';
import type { TaskExecutorStore } from './executor';
import { createTaskExecutor } from './executor';

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

/** Converts the schema-aware store to the executor's store interface. */
function toExecutorStore(store: TaskStore): TaskExecutorStore {
  return {
    getTaskRun: (id) => store.getTaskRun(id),
    updateTaskRun: (id, patch) => store.updateTaskRun(id, patch),
    updateStage: (id, key, patch) => store.updateStage(id, key, patch),
    transitionStage: (taskRunId, stageKey, runPatch, stagePatch) =>
      store.transitionStage(taskRunId, stageKey, runPatch as any, stagePatch as any),
  };
}

/** Builds one task scheduler backed by the given store. */
export function createTaskScheduler(store: TaskStore): TaskScheduler {
  return {
    async listCandidates(): Promise<TaskScheduleCandidate[]> {
      const [pending, resuming] = await Promise.all([
        store.listPendingTaskRuns(),
        store.listResumingTaskRuns(),
      ]);

      return [
        ...pending.map(run => ({ run, reason: 'pending' as const })),
        ...resuming.map(run => ({ run, reason: 'resuming' as const })),
      ];
    },

    async trigger(): Promise<void> {
      const candidates = await this.listCandidates();

      for (const { run, reason } of candidates) {
        const taskRunId = run.id;

        try {
          const snapshot = await store.getTaskRun(taskRunId);

          if (!snapshot) {
            // Task disappeared – mark as failed if still pending
            await store.updateTaskRun(taskRunId, {
              status: 'failed',
              terminalReason: 'schedule_exhausted',
              finishedAt: new Date(),
              controlRequestKind: null,
              currentStageKey: null,
              currentStageIndex: null,
              currentResumeMode: null,
              pausedResumeMode: null,
            }).catch(() => {});
            continue;
          }

          const executor = createTaskExecutor(toExecutorStore(store));
          await executor.runTask(snapshot);
        } catch {
          // Scheduler-level safety net — execution errors are handled inside runTask
          await store.updateTaskRun(taskRunId, {
            status: 'failed',
            terminalReason: 'schedule_exhausted',
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
  };
}
