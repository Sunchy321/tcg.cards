import { parentPort, workerData } from 'node:worker_threads';
import { eq } from 'drizzle-orm';
import { createDb } from '@tcg-cards/db';
import { TaskRun } from '@tcg-cards/db/schema/local/task';

import './task/discover';
import { getTask } from './task/registry';
import { TaskStore } from './task/store';

/** Immutable launch data passed by the task host to one Worker. */
interface LaunchData {
  taskRunId:   string;
  taskType:    string;
  databaseUrl: string;
}

const launch = workerData as LaunchData;
const port = parentPort;
if (!port) throw new Error('Task Worker requires a parent');

/** Announces a state change so the host can fetch one authoritative snapshot. */
function changed(phase: 'loading' | 'running' | 'finished'): void {
  port!.postMessage({ taskRunId: launch.taskRunId, phase });
}

/** Loads one task definition and runs its planned stages in this Worker. */
async function execute(): Promise<void> {
  const store = new TaskStore(launch.databaseUrl);
  try {
    changed('loading');
    const registration = getTask(launch.taskType);
    const { default: definition } = await registration.load();
    const [record] = await createDb(launch.databaseUrl).select({ params: TaskRun.params })
      .from(TaskRun).where(eq(TaskRun.id, launch.taskRunId)).limit(1);
    if (!record) throw new Error('Task parameters were not found');
    const params = record.params;
    const stages = await definition.stages(params);
    await store.plan(launch.taskRunId, stages);
    changed('running');
    const controller = new AbortController();
    for (const [index, stage] of stages.entries()) {
      await store.beginStage(launch.taskRunId, stage.key, index);
      changed('running');
      await stage.run({
        params,
        signal: controller.signal,
        async progress(done) {
          if (!Number.isSafeInteger(done) || done < 0 || done > stage.total) {
            throw new Error('Invalid task progress');
          }
          await store.progress(launch.taskRunId, stage.key, done);
          changed('running');
        },
      });
      await store.completeStage(launch.taskRunId, stage.key);
      changed('running');
    }
    await store.complete(launch.taskRunId, definition.result?.(params) ?? {});
    changed('finished');
  } catch (error) {
    await store.fail(launch.taskRunId, error instanceof Error ? error.message : 'Task failed');
    changed('finished');
  }
}

void execute();
