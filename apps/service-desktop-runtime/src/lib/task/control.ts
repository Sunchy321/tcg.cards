import type { TaskControlResult } from '@tcg-cards/model/src/task';

import type { TaskStore, TaskRunSnapshot } from './store';
import type { TaskScheduler } from './scheduler';
import type { TaskDefinition, TaskRunInput } from './definition';
import { getTaskDefinition } from './registry';

/** Defines the write-side control surface exposed by the task framework. */
export interface TaskController {
  createTask(input: TaskRunInput, definition: TaskDefinition): Promise<TaskControlResult>;
  pauseTask(taskRunId: string): Promise<TaskControlResult>;
  resumeTask(taskRunId: string): Promise<TaskControlResult>;
  cancelTask(taskRunId: string): Promise<TaskControlResult>;
  retryTask(taskRunId: string): Promise<TaskControlResult>;
}

/** Builds one task controller backed by the given store and scheduler. */
export function createTaskController(
  store: TaskStore,
  _scheduler: TaskScheduler,
): TaskController {
  return {
    async createTask(input, definition): Promise<TaskControlResult> {
      const stagePlans = await definition.buildStagePlan(input);

      const snapshot = await store.createTaskRun({
        run: input,
        supportsResume: definition.supportsResume,
        stages: stagePlans,
      });

      return toTaskControlResult(snapshot);
    },

    async pauseTask(_taskRunId): Promise<TaskControlResult> {
      throw new Error('Task pause is not implemented yet');
    },

    async resumeTask(_taskRunId): Promise<TaskControlResult> {
      throw new Error('Task resume is not implemented yet');
    },

    async cancelTask(taskRunId: string): Promise<TaskControlResult> {
      const snapshot = await store.getTaskRun(taskRunId);

      if (!snapshot) {
        throw new Error(`Task run ${taskRunId} does not exist`);
      }

      const cancelable: readonly string[] = ['pending', 'running', 'pausing', 'paused', 'resuming'];

      if (!cancelable.includes(snapshot.run.status)) {
        throw new Error(
          `Task run ${taskRunId} is in status "${snapshot.run.status}" and cannot be canceled`,
        );
      }

      // pending, paused, resuming can be canceled directly (no executor to wait for)
      const directFinalize: readonly string[] = ['pending', 'paused', 'resuming'];

      if (directFinalize.includes(snapshot.run.status)) {
        const updated = await store.updateTaskRun(taskRunId, {
          status: 'canceled',
          terminalReason: 'manual_cancel',
          finishedAt: new Date(),
          controlRequestKind: null,
          currentStageKey: null,
          currentStageIndex: null,
          currentResumeMode: null,
          pausedResumeMode: null,
        });

        return {
          taskRunId: updated.id,
          runRevision: updated.runRevision,
          status: updated.status,
        };
      }

      // running, pausing need executor to finish current block first
      const updated = await store.updateTaskRun(taskRunId, {
        status: 'canceling',
        controlRequestKind: 'cancel',
      });

      return {
        taskRunId: updated.id,
        runRevision: updated.runRevision,
        status: updated.status,
      };
    },

    async retryTask(_taskRunId): Promise<TaskControlResult> {
      throw new Error('Task retry is not implemented yet');
    },
  };
}

/** Projects one run snapshot into the minimal control result returned by write APIs. */
export function toTaskControlResult(snapshot: TaskRunSnapshot): TaskControlResult {
  return {
    taskRunId: snapshot.run.id,
    runRevision: snapshot.run.runRevision,
    status: snapshot.run.status,
  };
}
