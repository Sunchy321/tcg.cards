import { createConsoleApiClient } from '@tcg-cards/console-platform';
import type { hearthstoneRouter } from '../../electron/runtime/orpc/hearthstone';
import type { imageRouter } from '../../electron/runtime/orpc/image';
import type { magicRouter } from '../../electron/runtime/orpc/magic';
import type { runtimeRouter } from '../../electron/runtime/orpc/runtime';
import type { yugiohRouter } from '../../electron/runtime/orpc/yugioh';
import { desktopApiFetch } from '~/composables/useDesktopPlatform';
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskView } from '../../electron/contract';

type DesktopRouter = {
  hearthstone: typeof hearthstoneRouter;
  hsdata:      typeof hearthstoneRouter;
  image:       typeof imageRouter;
  magic:       typeof magicRouter;
  runtime:     typeof runtimeRouter;
  yugioh:      typeof yugiohRouter;
};

/** Typed service client routed through Electron's private main-process bridge. */
export const orpc = createConsoleApiClient<DesktopRouter>({
  url:            'https://desktop.invalid/rpc',
  fetch:          desktopApiFetch,
  defaultContext: { meta: { editorRuntime: 'desktop', syncMode: 'local_edit', editorSource: 'manual' } },
});

/** Starts one page task through the Electron host and returns its saved page view. */
export async function startDesktopTask(taskType: string, params: Record<string, unknown>): Promise<TaskPageSnapshot | null> {
  // Acceptance precedes persistence. Subscribe before launching so neither a fast
  // creation failure nor the first saved snapshot can be lost between IPC calls.
  const updates = new Map<string, TaskView>();
  let taskRunId: string | undefined;
  let receive: ((task: TaskView) => void) | undefined;
  const unsubscribe = window.desktop.tasks.onChange(task => {
    updates.set(task.id, task);
    if (task.id === taskRunId) {
      receive?.(task);
    }
  });

  try {
    const reply = await window.desktop.tasks.start(taskType, params);
    if (!reply) {
      return null;
    }
    taskRunId = reply.taskRunId;
    const saved = await window.desktop.tasks.get(taskRunId);
    const task = await new Promise<TaskView>(resolve => {
      /** Waits for a page view or a creation failure that has no saved row. */
      receive = candidate => {
        if (candidate.pageSnapshot || candidate.status === 'failed' || candidate.status === 'discarded') {
          resolve(candidate);
        }
      };
      const current = updates.get(reply.taskRunId);
      if (current) {
        receive(current);
      }
      if (saved) {
        receive(saved);
      }
    });
    if (task.pageSnapshot) {
      return task.pageSnapshot;
    }
    throw new Error(task.errorMessage ?? '无法启动任务');
  } finally {
    unsubscribe();
  }
}

/** Reads one task snapshot from the Electron host for page restoration. */
export async function getDesktopTaskSnapshot(taskRunId: string): Promise<TaskPageSnapshot | null> {
  const task = await window.desktop.tasks.get(taskRunId);
  return task?.pageSnapshot ?? null;
}
