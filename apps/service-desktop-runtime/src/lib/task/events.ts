import type { TaskPageEvent } from '@tcg-cards/model/src/task';

/** Publishes current page-task snapshots to runtime-local subscribers. */
export interface TaskEventPublisher {
  publish(snapshot: TaskPageEvent): void;
  watch(taskRunId: string): AsyncGenerator<TaskPageEvent>;
}

/** Subscriber receives events for watched task runs. */
interface TaskEventSubscriber {
  push(event: TaskPageEvent): void;
}

const subscribers = new Set<TaskEventSubscriber>();

function notify(event: TaskPageEvent): void {
  for (const sub of subscribers) {
    sub.push(event);
  }
}

/** Builds one in-memory event publisher for the task framework. */
export function createTaskEventPublisher(): TaskEventPublisher {
  return {
    publish(snapshot) {
      notify(snapshot);
    },

    async * watch(taskRunId: string) {
      const queue: TaskPageEvent[] = [];
      let wake: (() => void) | null = null;
      let stopped = false;

      const push = (event: TaskPageEvent) => {
        if (stopped) return;
        // Only enqueue events matching the requested task run
        if (event.pageTask.kind !== 'attached' || event.pageTask.taskRunId !== taskRunId) return;
        queue.push(event);
        if (wake) { const resolve = wake; wake = null; resolve(); }
      };

      const subscriber: TaskEventSubscriber = { push };
      subscribers.add(subscriber);

      try {
        while (!stopped) {
          if (queue.length === 0) {
            await new Promise<void>(resolve => { wake = resolve; });
          }
          while (queue.length > 0) {
            const event = queue.shift()!;
            yield event;
          }
        }
      } finally {
        stopped = true;
        if (wake) wake();
        subscribers.delete(subscriber);
      }
    },
  };
}
