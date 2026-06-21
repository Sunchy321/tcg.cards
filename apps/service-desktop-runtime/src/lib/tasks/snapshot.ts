import type { TaskPageSnapshot } from '@tcg-cards/model/src/task';

/** Builds one idle page snapshot placeholder. */
export function createIdleTaskPageSnapshot(): TaskPageSnapshot {
  return {
    pageTask: { kind: 'idle' },
    stages: [],
  };
}
