import type { TaskControlResult } from '@tcg-cards/model/src/task';

import type { TaskStore, TaskRunSnapshot } from './store';
import type { TaskScheduler } from './scheduler';
import type { TaskDefinition, TaskRunInput } from './definition';

/** Defines the write-side control surface exposed by the task framework. */
export interface TaskController {
  createTask(input: TaskRunInput, definition: TaskDefinition): Promise<TaskControlResult>;
  pauseTask(taskRunId: string): Promise<TaskControlResult>;
  resumeTask(taskRunId: string): Promise<TaskControlResult>;
  cancelTask(taskRunId: string): Promise<TaskControlResult>;
  retryTask(taskRunId: string): Promise<TaskControlResult>;
}

/** Builds one not-yet-implemented controller placeholder for future wiring. */
export function createTaskController(
  _store: TaskStore,
  _scheduler: TaskScheduler,
): TaskController {
  return {
    async createTask(_input, _definition) {
      throw new Error('Task creation is not implemented yet');
    },
    async pauseTask(_taskRunId) {
      throw new Error('Task pause is not implemented yet');
    },
    async resumeTask(_taskRunId) {
      throw new Error('Task resume is not implemented yet');
    },
    async cancelTask(_taskRunId) {
      throw new Error('Task cancel is not implemented yet');
    },
    async retryTask(_taskRunId) {
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
