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
  abandonTask(taskRunId: string, terminalReason?: string): Promise<TaskControlResult>;
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

    async pauseTask(taskRunId: string): Promise<TaskControlResult> {
      const snapshot = await store.getTaskRun(taskRunId);

      if (!snapshot) {
        throw new Error(`Task run ${taskRunId} does not exist`);
      }

      const pausable: readonly string[] = ['running'];

      if (!pausable.includes(snapshot.run.status)) {
        throw new Error(
          `Task run ${taskRunId} is in status "${snapshot.run.status}" and cannot be paused`,
        );
      }

      // running → pausing, executor will pick it up at the next block boundary
      const updated = await store.updateTaskRun(taskRunId, {
        status: 'pausing',
        controlRequestKind: 'pause',
      });

      return {
        taskRunId: updated.id,
        runRevision: updated.runRevision,
        status: updated.status,
      };
    },

    async resumeTask(taskRunId: string): Promise<TaskControlResult> {
      const snapshot = await store.getTaskRun(taskRunId);

      if (!snapshot) {
        throw new Error(`Task run ${taskRunId} does not exist`);
      }

      if (snapshot.run.status !== 'paused') {
        throw new Error(
          `Task run ${taskRunId} is in status "${snapshot.run.status}" and cannot be resumed`,
        );
      }

      const updated = await store.updateTaskRun(taskRunId, {
        status: 'resuming',
        controlRequestKind: null,
      });

      return {
        taskRunId: updated.id,
        runRevision: updated.runRevision,
        status: updated.status,
      };
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

    async retryTask(taskRunId: string): Promise<TaskControlResult> {
      const snapshot = await store.getTaskRun(taskRunId);

      if (!snapshot) {
        throw new Error(`Task run ${taskRunId} does not exist`);
      }

      const retryable: readonly string[] = ['failed', 'canceled', 'abandoned'];

      if (!retryable.includes(snapshot.run.status)) {
        throw new Error(
          `Task run ${taskRunId} is in status "${snapshot.run.status}" and cannot be retried`,
        );
      }

      const definition = getTaskDefinition(snapshot.run.taskType);
      const stagePlans = await definition.buildStagePlan({
        taskType: snapshot.run.taskType,
        definitionVersion: snapshot.run.definitionVersion,
        scope: snapshot.run.scope,
        params: snapshot.run.params,
      });

      const newSnapshot = await store.createTaskRun({
        run: {
          taskType: snapshot.run.taskType,
          definitionVersion: snapshot.run.definitionVersion,
          scope: snapshot.run.scope,
          params: snapshot.run.params,
        },
        supportsResume: definition.supportsResume,
        stages: stagePlans,
        retryOfTaskRunId: taskRunId,
      });

      return toTaskControlResult(newSnapshot);
    },

    async abandonTask(taskRunId: string, terminalReason: string = 'abandoned_stale_run'): Promise<TaskControlResult> {
      const snapshot = await store.getTaskRun(taskRunId);

      if (!snapshot) {
        throw new Error(`Task run ${taskRunId} does not exist`);
      }

      // Only active statuses can be abandoned
      const abandonable: readonly string[] = ['pending', 'running', 'pausing', 'paused', 'resuming', 'canceling'];

      if (!abandonable.includes(snapshot.run.status)) {
        throw new Error(
          `Task run ${taskRunId} is in status "${snapshot.run.status}" and cannot be abandoned`,
        );
      }

      // Abandon transitions directly — assumes the executor is already dead,
      // no need to set controlRequestKind or wait for acknowledgment
      const updated = await store.updateTaskRun(taskRunId, {
        status: 'abandoned',
        terminalReason: terminalReason as any,
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
