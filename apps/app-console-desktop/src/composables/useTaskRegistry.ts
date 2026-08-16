import { consumeEventIterator } from '@orpc/client';
import type { TaskPageEvent } from '@tcg-cards/model/src/task';
import { computed, ref } from 'vue';

import { useDesktopRuntimeClient } from './useDesktopRuntimeClient';

const terminalStatuses = new Set(['completed', 'failed', 'canceled', 'abandoned']);

// Module-level reactive state shared by all consumers
const _rev = ref(0);
const _map = new Map<string, TaskPageEvent>();
const _watchers = new Map<string, () => void>();

function _set(id: string, ev: TaskPageEvent): void {
  _map.set(id, ev);
  _rev.value++;
}

function _delete(id: string): void {
  _map.delete(id);
  _rev.value++;
}

function _isTerminal(ev: TaskPageEvent): boolean {
  return ev.pageTask.kind === 'attached' && terminalStatuses.has(ev.pageTask.status);
}

/** Convenience wrapper: register a task snapshot without calling useTaskRegistry directly. */
export function registerTask(snapshot: TaskPageEvent): void {
  useTaskRegistry().register(snapshot);
}

/** Nuxt composable that returns reactive helpers for the global task registry. */
export function useTaskRegistry() {
  const client = useDesktopRuntimeClient();

  /** All registered task events (latest snapshot for each task). */
  const taskEvents = computed(() => {
    _rev.value;
    return Array.from(_map.values());
  });

  /** Count of non-terminal (active) tasks. */
  const activeTaskCount = computed(() => {
    _rev.value;
    let n = 0;
    for (const ev of _map.values()) {
      if (ev.pageTask.kind === 'attached' && !terminalStatuses.has(ev.pageTask.status)) n++;
    }
    return n;
  });

  /** Register a newly created task for real-time watch events. */
  function register(snapshot: TaskPageEvent): void {
    if (snapshot.pageTask.kind !== 'attached') return;
    const id = snapshot.pageTask.taskRunId;
    if (_watchers.has(id)) return;

    _set(id, snapshot);

    const unsub = consumeEventIterator(
      client.task.watch({ taskRunId: id }),
      {
        onEvent(event: TaskPageEvent) {
          _set(id, event);
          if (_isTerminal(event)) {
            setTimeout(() => _delete(id), 10_000);
          }
        },
      },
    );
    _watchers.set(id, unsub);
  }

  /** Remove a task from the registry immediately. */
  function unregister(taskRunId: string): void {
    _delete(taskRunId);
    const unsub = _watchers.get(taskRunId);
    if (unsub) {
      unsub();
      _watchers.delete(taskRunId);
    }
  }

  return { taskEvents, activeTaskCount, register, unregister };
}
