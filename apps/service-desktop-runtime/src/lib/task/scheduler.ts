import type { TaskStore, TaskRunRecord } from './store';
import { runTaskInWorker } from './worker';
import { requireLocalDatabaseUrl } from '../hearthstone/hsdata-local-db';

/** Captures one waiting task candidate that the scheduler may try to claim. */
export interface TaskScheduleCandidate {
  run:    TaskRunRecord;
  reason: 'pending' | 'resuming';
}

/** Describes the scheduler surface used by control paths and background loops. */
export interface TaskScheduler {
  listCandidates(): Promise<TaskScheduleCandidate[]>;
  trigger(): Promise<void>;
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

      for (const { run } of candidates) {
        const taskRunId = run.id;

        const snapshot = await store.getTaskRun(taskRunId);
        if (!snapshot) {
          await store.updateTaskRun(taskRunId, {
            status:             'failed',
            terminalReason:     'schedule_exhausted',
            finishedAt:         new Date(),
            controlRequestKind: null,
            currentStageKey:    null,
            currentStageIndex:  null,
            currentResumeMode:  null,
            pausedResumeMode:   null,
          }).catch(() => {});
          continue;
        }

        runTaskInWorker(taskRunId, requireLocalDatabaseUrl());
      }
    },
  };
}
