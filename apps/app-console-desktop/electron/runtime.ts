import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';

import './task/discover';
import { electronRuntimeApp } from './runtime-app';
import { applyRuntimeOverrides, collectRuntimeOverrides } from './runtime/runtime-config';
import { findTask, getTask } from './task/registry';
import type { TaskDescription,
  RuntimeRequest,
  RuntimeResponse,
  RuntimeTaskEvent,
  TaskControlKind,
  TaskStartResult,
  TaskView,
  WorkerCommand,
  WorkerMessage } from './contract';
import { recoverUnfinishedRuns } from './task/recover';
import { TaskStore } from './task/store';
import { resolveYugiohPublishTarget } from './runtime/lib/runtime/desktop-database';

const stores = new Map<string, TaskStore>();
const recovered = new Map<string, Promise<void>>();
const workers = new Map<string, Worker>();
const bootTimes = new Map<string, number>();
const phases = new Map<string, TaskView['phase']>();
const apiControllers = new Map<number, AbortController>();

/** Set once a deliberate shutdown starts; new task work is refused from then on. */
let closing = false;

/** Statuses that can still be controlled before a run settles. */
const controllableStatuses = ['pending', 'running', 'pausing', 'paused', 'resuming', 'canceling', 'interrupted'];

/** Projects a registration into the host-only facts needed before task acceptance. */
function describeTask(taskType: string, params?: Record<string, unknown>): TaskDescription | null {
  const registration = findTask(taskType);
  if (!registration) return null;
  return {
    taskType:            taskType,
    admission:           registration.admission ?? null,
    publishConfirmation: params ? registration.publishConfirmation?.(params) ?? null : null,
  };
}

/** Resolves after the given delay so shutdowns are never blocked by a stuck Worker. */
function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/** Reuses one local database client for each configured connection string. */
function storeFor(databaseUrl: string): TaskStore {
  let store = stores.get(databaseUrl);
  if (!store) {
    store = new TaskStore(databaseUrl);
    stores.set(databaseUrl, store);
  }
  return store;
}

/** Reclassifies unfinished runs of one database and reports the resulting states. */
async function recoverAndPublish(store: TaskStore): Promise<void> {
  await recoverUnfinishedRuns(store, findTask);
  for (const task of await store.listActive()) await publish(store, task.id);
}

/** Opens one database and classifies runs from previous boots exactly once before it is read. */
async function storeReady(databaseUrl: string): Promise<TaskStore> {
  const store = storeFor(databaseUrl);
  let pending = recovered.get(databaseUrl);
  if (!pending) {
    pending = recoverAndPublish(store).catch(error => {
      recovered.delete(databaseUrl);
      throw error;
    });
    recovered.set(databaseUrl, pending);
  }
  await pending;
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

/** Sends one control instruction to the Worker that owns a run, if it is alive. */
function instruct(taskRunId: string, control: TaskControlKind): void {
  workers.get(taskRunId)?.postMessage({ taskRunId, control } satisfies WorkerCommand);
}

/** Starts one Worker after the pending task run has been saved. */
function launch(store: TaskStore, taskRunId: string, taskType: string, databaseUrl: string): void {
  phases.set(taskRunId, 'starting');
  const worker = new Worker(resolve(__dirname, 'task-worker.js'), {
    workerData: { taskRunId, taskType, databaseUrl, runtimeOverrides: collectRuntimeOverrides() },
  });
  workers.set(taskRunId, worker);
  let settled = false;
  /** Converts a lost Worker into a visible terminal task. */
  const fail = async () => {
    if (settled) return;
    settled = true;
    phases.set(taskRunId, 'finished');
    // A deliberate shutdown leaves reclassification to the recovery scan instead of failing the run.
    if (!closing && !(await store.isTerminal(taskRunId))) await store.fail(taskRunId, '任务执行环境异常结束');
    await publish(store, taskRunId);
  };
  worker.on('message', (message: WorkerMessage) => {
    if (message.taskRunId !== taskRunId) return;
    if (message.phase) {
      phases.set(taskRunId, message.phase);
      if (message.phase === 'finished') {
        settled = true;
        void worker.terminate();
      }
      console.info('[task startup]', taskRunId, message.phase, Date.now() - (bootTimes.get(taskRunId) ?? Date.now()));
    }
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

/** Reuses the unfinished run of a task type instead of creating a competing one. */
async function reuseOrCreate(
  store: TaskStore,
  taskRunId: string,
  taskType: string,
  params: Record<string, unknown>,
  databaseUrl: string,
  retryOfTaskRunId?: string,
): Promise<TaskStartResult> {
  const existing = await store.findActiveByType(taskType);
  if (existing) {
    await publish(store, existing.id);
    return { created: false, task: decorate(existing) };
  }
  const registration = getTask(taskType);
  bootTimes.set(taskRunId, Date.now());
  phases.set(taskRunId, 'saving');
  console.info('[task startup]', taskRunId, 'saving', 0);
  try {
    await store.create(taskRunId, registration, params, retryOfTaskRunId);
  } catch (error) {
    // The persistent single-instance constraint won a concurrent creation race.
    const raced = await store.findActiveByType(taskType);
    if (raced) {
      await publish(store, raced.id);
      return { created: false, task: decorate(raced) };
    }
    throw error;
  }
  await publish(store, taskRunId);
  try {
    launch(store, taskRunId, taskType, databaseUrl);
  } catch (error) {
    await store.fail(taskRunId, error instanceof Error ? error.message : '无法启动任务');
    await publish(store, taskRunId);
    throw error;
  }
  const created = await store.get(taskRunId);
  if (!created) throw new Error('Task was not saved');
  return { created: true, task: decorate(created) };
}

/** Applies one control request and forwards it to the Worker that owns the run. */
async function control(
  store: TaskStore,
  taskRunId: string,
  kind: TaskControlKind,
  databaseUrl: string,
): Promise<TaskView> {
  const task = await store.get(taskRunId);
  if (!task) throw new Error('任务不存在或已清除。');
  const worker = workers.get(taskRunId);
  if (kind === 'pause') {
    if (task.status !== 'running') throw new Error('任务当前状态不支持暂停。');
    if (!worker) throw new Error('任务执行环境不可用，无法暂停。');
    if (!(await store.requestPause(taskRunId))) throw new Error('任务状态已变化，请刷新后重试。');
    instruct(taskRunId, 'pause');
  } else if (kind === 'resume') {
    if (!['paused', 'interrupted'].includes(task.status)) throw new Error('任务当前状态不支持继续。');
    if (!(await store.requestResume(taskRunId))) throw new Error('任务状态已变化，请刷新后重试。');
    // A Worker that survived keeps its stage in memory; otherwise a fresh one continues the checkpoint.
    if (worker) instruct(taskRunId, 'resume');
    else launch(store, taskRunId, task.taskType, databaseUrl);
  } else {
    if (!controllableStatuses.includes(task.status)) throw new Error('任务已结束，无法取消。');
    if (['running', 'pausing'].includes(task.status) && worker) {
      await store.requestCancel(taskRunId);
    } else {
      await store.markCanceled(taskRunId);
    }
    instruct(taskRunId, 'cancel');
  }
  await publish(store, taskRunId);
  const updated = await store.get(taskRunId);
  if (!updated) throw new Error('任务不存在或已清除。');
  return decorate(updated);
}

/** Stops accepting task work, winds every Worker down at a safe boundary, and reclassifies runs. */
async function shutdownHost(): Promise<void> {
  closing = true;
  for (const [taskRunId, worker] of workers) {
    worker.postMessage({ taskRunId, control: 'shutdown' } satisfies WorkerCommand);
  }
  await Promise.race([
    Promise.allSettled([...workers.values()].map(worker => new Promise<void>(resolve => worker.once('exit', resolve)))),
    delay(10_000),
  ]);
  for (const store of stores.values()) await recoverAndPublish(store).catch(() => {});
}

/** Serves task commands through Electron's private utility-process port. */
async function handle(request: RuntimeRequest): Promise<RuntimeResponse> {
  if (!Number.isSafeInteger(request.id)) throw new Error('Invalid request');
  if (request.method === 'health') {
    return { id: request.id, result: { runtime: 'node', pid: process.pid, version: process.versions.node } };
  }
  if (request.method === 'shutdown') {
    await shutdownHost();
    return { id: request.id, result: null };
  }
  if (request.method === 'runtime:configure') {
    applyRuntimeOverrides(request.state);
    return { id: request.id, result: null };
  }
  if (request.method === 'api:cancel') {
    apiControllers.get(request.requestId)?.abort('renderer canceled request');
    return { id: request.id, result: null };
  }
  if (request.method === 'yugioh:resolve-publish-target') {
    const target = await resolveYugiohPublishTarget(request);
    return { id: request.id, result: { targetFingerprint: target.targetFingerprint } };
  }
  if (closing && ['task:start', 'task:retry', 'task:control'].includes(request.method)) {
    throw new Error('应用正在退出，不能操作任务。');
  }
  const store = 'databaseUrl' in request && request.databaseUrl ? await storeReady(request.databaseUrl) : null;
  if (request.method === 'task:describe') {
    return { id: request.id, result: describeTask(request.taskType, request.params) };
  }
  if (request.method === 'task:describe-retry') {
    if (!store) throw new Error('Local database is not configured');
    const source = await store.parametersOf(request.taskRunId);
    if (!source) throw new Error('任务不存在或已清除。');
    return { id: request.id, result: describeTask(source.taskType, source.params) };
  }
  if (request.method === 'task:list') {
    await Promise.allSettled(recovered.values());
    const groups = await Promise.all([...stores.values()].map(knownStore => knownStore.listActive()));
    const tasks = [...new Map(groups.flat().map(task => [task.id, decorate(task)])).values()];
    return { id: request.id, result: tasks };
  }
  if (request.method === 'task:get') {
    await Promise.allSettled(recovered.values());
    for (const knownStore of stores.values()) {
      const task = await knownStore.get(request.taskRunId);
      if (task) return { id: request.id, result: decorate(task) };
    }
    return { id: request.id, result: null };
  }
  if (request.method === 'task:find-active') {
    if (!store) throw new Error('Local database is not configured');
    const task = await store.findActiveByType(request.taskType);
    return { id: request.id, result: task ? decorate(task) : null };
  }
  if (request.method === 'task:latest-by-types') {
    if (!store) throw new Error('Local database is not configured');
    const tasks = await store.latestByTypes(request.taskTypes);
    return { id: request.id, result: tasks.map(task => decorate(task)) };
  }
  if (!store) throw new Error('Local database is not configured');
  if (request.method === 'task:start') {
    const result = await reuseOrCreate(store, request.taskRunId, request.taskType, request.params, request.databaseUrl);
    return { id: request.id, result };
  }
  if (request.method === 'task:retry') {
    if (!(await store.isRetryable(request.retryOfTaskRunId))) throw new Error('任务当前状态不支持重试。');
    const source = await store.parametersOf(request.retryOfTaskRunId);
    if (!source) throw new Error('任务不存在或已清除。');
    const result = await reuseOrCreate(
      store,
      request.taskRunId,
      source.taskType,
      request.operatorUserId == null ? source.params : { ...source.params, operatorUserId: request.operatorUserId },
      request.databaseUrl,
      request.retryOfTaskRunId,
    );
    return { id: request.id, result };
  }
  if (request.method === 'task:control') {
    const task = await control(store, request.taskRunId, request.kind, request.databaseUrl);
    return { id: request.id, result: task };
  }
  throw new Error('Unsupported task request');
}

/** Runs one Fetch request inside the isolated Node process and forwards its response stream. */
async function handleApiRequest(request: Extract<RuntimeRequest, { method: 'api:request' }>): Promise<void> {
  const controller = new AbortController();
  apiControllers.set(request.id, controller);
  let headersSent = false;

  try {
    const url = new URL(request.path, 'http://desktop.local');
    if (url.origin !== 'http://desktop.local' || !url.pathname.startsWith('/')) {
      throw new Error('Invalid local API path');
    }
    const body = request.body == null ? undefined : Uint8Array.from(request.body).buffer;
    const headers = new Headers(request.headers);
    headers.set('x-tcg-task-host', 'electron');
    const fetchRequest = new Request(url, {
      method: request.requestMethod,
      headers,
      body,
      signal: controller.signal,
    });
    const response = await electronRuntimeApp.fetch(fetchRequest);
    process.parentPort.postMessage({
      id:     request.id,
      result: { status: response.status, headers: [...response.headers.entries()] },
    } satisfies RuntimeResponse);
    headersSent = true;

    if (!response.body) {
      process.parentPort.postMessage({ event: 'api:end', id: request.id });
      return;
    }

    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > 0) {
          process.parentPort.postMessage({ event: 'api:chunk', id: request.id, chunk: value });
        }
      }
      process.parentPort.postMessage({ event: 'api:end', id: request.id });
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local API request failed';
    if (headersSent) {
      process.parentPort.postMessage({ event: 'api:end', id: request.id, error: message });
    } else {
      process.parentPort.postMessage({ id: request.id, error: message } satisfies RuntimeResponse);
    }
  } finally {
    apiControllers.delete(request.id);
  }
}

process.parentPort.on('message', ({ data }: { data: RuntimeRequest }) => {
  if (data.method === 'api:request') {
    void handleApiRequest(data);
    return;
  }
  void handle(data).then(response => process.parentPort.postMessage(response)).catch(error => {
    process.parentPort.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Task request failed' } satisfies RuntimeResponse);
  });
});
