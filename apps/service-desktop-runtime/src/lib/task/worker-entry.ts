import './task-definitions';
import { applyRuntimeOverrides, type RuntimeOverrides } from '../../runtime-config';
import { getLocalDb } from '../hearthstone/hsdata-local-db';
import { createTaskStore } from './store';
import { createTaskExecutor } from './executor';

self.onmessage = async e => {
  const { taskRunId, overrides } = e.data as { taskRunId: string, overrides: RuntimeOverrides };

  applyRuntimeOverrides(overrides);

  try {
    const store = createTaskStore(getLocalDb());
    console.log('[worker] store created');

    const executor = createTaskExecutor(store);
    console.log('[worker] executor created');

    const snapshot = await store.getTaskRun(taskRunId);
    if (!snapshot) {
      throw new Error(`Task run ${taskRunId} not found`);
    }

    console.log('[worker] starting runTask');
    await executor.runTask(snapshot);
    console.log('[worker] runTask completed');
  } catch (err) {
    console.error(`[task] Worker execution failed:`, err);

    // Mark task as failed so it doesn't stay stuck in pending/running
    try {
      const store = createTaskStore(getLocalDb());
      await store.updateTaskRun(taskRunId, {
        status:             'failed',
        terminalReason:     'execution_failed',
        errorMessage:       (err as Error)?.message ?? String(err),
        finishedAt:         new Date(),
        controlRequestKind: null,
        currentStageKey:    null,
        currentStageIndex:  null,
        currentResumeMode:  null,
        pausedResumeMode:   null,
      });
    } catch (storeErr) {
      console.error(`[task] Failed to mark task ${taskRunId} as failed:`, storeErr);
    }
  } finally {
    self.postMessage({ done: true, taskRunId });
  }
};
