import type { TaskPageEvent } from '@tcg-cards/model/src/task';

/** Publishes current page-task snapshots to runtime-local subscribers. */
export interface TaskEventPublisher {
  publish(snapshot: TaskPageEvent): void;
  watch(): AsyncGenerator<TaskPageEvent>;
}

/** Builds one not-yet-implemented event publisher placeholder. */
export function createTaskEventPublisher(): TaskEventPublisher {
  return {
    publish(_snapshot) {
      throw new Error('Task event publishing is not implemented yet');
    },
    async * watch() {
      throw new Error('Task event streaming is not implemented yet');
    },
  };
}
