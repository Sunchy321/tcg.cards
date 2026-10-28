import { createConsoleApiClient } from '@tcg-cards/console-platform';
import type { hearthstoneRouter } from '../../electron/runtime/orpc/hearthstone';
import type { imageRouter } from '../../electron/runtime/orpc/image';
import type { magicRouter } from '../../electron/runtime/orpc/magic';
import type { runtimeRouter } from '../../electron/runtime/orpc/runtime';
import type { yugiohRouter } from '../../electron/runtime/orpc/yugioh';
import { desktopApiFetch } from '~/composables/useDesktopPlatform';
import type { TaskPageSnapshot } from '@tcg-cards/model/task';

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
  const reply = await window.desktop.tasks.start(taskType, params);
  if (!reply) return null;
  const task = await window.desktop.tasks.get(reply.taskRunId);
  return task?.pageSnapshot ?? null;
}

/** Reads one task snapshot from the Electron host for page restoration. */
export async function getDesktopTaskSnapshot(taskRunId: string): Promise<TaskPageSnapshot | null> {
  const task = await window.desktop.tasks.get(taskRunId);
  return task?.pageSnapshot ?? null;
}
