import './task-definitions';
import { setLocalDatabaseUrlOverride } from '../../runtime-config';
import { getLocalDb } from '../hearthstone/hsdata-local-db';
import { createTaskStore } from './store';
import { createTaskExecutor } from './executor';

self.onmessage = async e => {
  const { taskRunId, dbUrl } = e.data as { taskRunId: string, dbUrl: string };

  try {
    setLocalDatabaseUrlOverride(dbUrl);
    const store = createTaskStore(getLocalDb());
    const executor = createTaskExecutor(store);

    const snapshot = await store.getTaskRun(taskRunId);
    if (!snapshot) {
      throw new Error(`Task run ${taskRunId} not found`);
    }

    await executor.runTask(snapshot);
  } catch (err) {
    console.error(`[task] Worker execution failed:`, err);

    // Mark task as failed so it doesn't stay stuck in pending/running
    try {
      const url = dbUrl;
      setLocalDatabaseUrlOverride(url);
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
