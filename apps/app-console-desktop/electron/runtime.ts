import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';

import './task/discover';
import { getTask } from './task/registry';
import { TaskStore } from './task/store';
import type { RuntimeRequest, RuntimeResponse, RuntimeTaskEvent, TaskView } from './contract';

const stores = new Map<string, TaskStore>();
const workers = new Map<string, Worker>();
const bootTimes = new Map<string, number>();
const phases = new Map<string, TaskView['phase']>();

/** Reuses one local database client for each configured connection string. */
function storeFor(databaseUrl: string): TaskStore {
  let store = stores.get(databaseUrl);
  if (!store) {
    store = new TaskStore(databaseUrl);
    stores.set(databaseUrl, store);
  }
  return store;
}

/** Adds live startup diagnostics to one persisted task snapshot. */
function decorate(task: TaskView): TaskView {
  let label = task.taskType;
  try {
    label = getTask(task.taskType).label;
  } catch { /* Historical task type may not be available yet. */ }
  return {
    ...task,
    label,
    phase:     phases.get(task.id) ?? task.phase,
    elapsedMs: bootTimes.has(task.id) ? Date.now() - bootTimes.get(task.id)! : task.elapsedMs,
  };
}

/** Pushes one authoritative snapshot to the main process after a state change. */
async function publish(store: TaskStore, taskRunId: string): Promise<void> {
  const task = await store.get(taskRunId);
  if (task) process.parentPort.postMessage({ event: 'task:changed', task: decorate(task) } satisfies RuntimeTaskEvent);
}

/** Starts one Worker after the pending task run has been saved. */
function launch(store: TaskStore, taskRunId: string, taskType: string, databaseUrl: string): void {
  phases.set(taskRunId, 'starting');
  const worker = new Worker(resolve(__dirname, 'task-worker.js'), {
    workerData: { taskRunId, taskType, databaseUrl },
  });
  workers.set(taskRunId, worker);
  let settled = false;
  /** Converts a lost Worker into a visible terminal task. */
  const fail = async () => {
    if (settled) return;
    settled = true;
    phases.set(taskRunId, 'finished');
    await store.fail(taskRunId, '任务执行环境异常结束');
    await publish(store, taskRunId);
  };
  worker.on('message', (message: { taskRunId: string, phase: TaskView['phase'] }) => {
    if (message.taskRunId !== taskRunId) return;
    phases.set(taskRunId, message.phase);
    if (message.phase === 'finished') {
      settled = true;
      void worker.terminate();
    }
    console.info('[task startup]', taskRunId, message.phase, Date.now() - (bootTimes.get(taskRunId) ?? Date.now()));
    void publish(store, taskRunId);
  });
  worker.on('error', error => {
    console.error('[task worker]', taskRunId, error instanceof Error ? error.name : 'Error');
    void fail();
  });
  worker.on('exit', () => {
    workers.delete(taskRunId);
    void fail();
  });
}

/** Serves task commands through Electron's private utility-process port. */
async function handle(request: RuntimeRequest): Promise<RuntimeResponse> {
  if (!Number.isSafeInteger(request.id)) throw new Error('Invalid request');
  if (request.method === 'health') {
    return { id: request.id, result: { runtime: 'node', pid: process.pid, version: process.versions.node } };
  }
  const store = request.databaseUrl ? storeFor(request.databaseUrl) : null;
  if (request.method === 'task:list') {
    const groups = await Promise.all([...stores.values()].map(knownStore => knownStore.listActive()));
    const tasks = [...new Map(groups.flat().map(task => [task.id, decorate(task)])).values()];
    return { id: request.id, result: tasks };
  }
  if (request.method === 'task:get') {
    for (const knownStore of stores.values()) {
      const task = await knownStore.get(request.taskRunId);
      if (task) return { id: request.id, result: decorate(task) };
    }
    return { id: request.id, result: null };
  }
  if (!store) throw new Error('Local database is not configured');
  const registration = getTask(request.taskType);
  bootTimes.set(request.taskRunId, Date.now());
  phases.set(request.taskRunId, 'saving');
  console.info('[task startup]', request.taskRunId, 'saving', 0);
  await store.create(request.taskRunId, registration, request.params);
  await publish(store, request.taskRunId);
  try {
    launch(store, request.taskRunId, request.taskType, request.databaseUrl);
  } catch (error) {
    await store.fail(request.taskRunId, error instanceof Error ? error.message : '无法启动任务');
    await publish(store, request.taskRunId);
    throw error;
  }
  return { id: request.id, result: await store.get(request.taskRunId) };
}

process.parentPort.on('message', ({ data }: { data: RuntimeRequest }) => {
  void handle(data).then(response => process.parentPort.postMessage(response)).catch(error => {
    process.parentPort.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Task request failed' } satisfies RuntimeResponse);
  });
});
