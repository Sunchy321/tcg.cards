import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { TaskStore } from './store.ts';
import type { TaskRegistration } from './registry.ts';

/** Unique task types keep test rows from colliding with real console runs. */
function registration(taskType: string): TaskRegistration {
  return {
    taskType,
    label:          taskType,
    version:        '1',
    supportsResume: false,
    scope:          params => ({ type: 'test', key: String(params.k ?? 'x') }),
    load:           async () => { throw new Error('Definitions are not needed here'); },
  };
}

function store(): TaskStore {
  return new TaskStore(process.env.DATABASE_URL!);
}

/** Ends one run so its task type stops occupying the single unfinished slot. */
async function endRun(task: TaskStore, id: string): Promise<void> {
  assert.equal(await task.markCanceled(id), true);
}

test('one task type keeps a single unfinished run across scopes', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const taskType = `ts_single_${randomUUID().slice(0, 8)}`;
  const first = await task.create(randomUUID(), registration(taskType), { k: 1 });
  assert.equal(first.status, 'pending');

  const found = await task.findActiveByType(taskType);
  assert.equal(found?.id, first.id);

  // A different scope cannot create a competing run; the persistence constraint rejects it.
  await assert.rejects(task.create(randomUUID(), registration(taskType), { k: 2 }));
  const reused = await task.findActiveByType(taskType);
  assert.equal(reused?.id, first.id);

  await endRun(task, first.id);
});

test('pause and resume settle through persisted control statuses', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const taskType = `ts_pause_${randomUUID().slice(0, 8)}`;
  const id = randomUUID();
  await task.create(id, registration(taskType), { k: 1 });
  await task.plan(id, [{ key: 'work', label: '执行中', total: 5 }]);

  // Pausing a run that has not started yet is refused.
  assert.equal(await task.requestPause(id), false);

  assert.equal(await task.beginStage(id, 'work', 0, 'none'), true);
  assert.equal((await task.get(id))?.status, 'running');

  assert.equal(await task.requestPause(id), true);
  // A pausing run cannot re-enter a stage; the Worker settles the pause instead.
  assert.equal(await task.beginStage(id, 'work', 0, 'none'), false);
  await task.markPaused(id, 'work', 'none');
  assert.equal((await task.get(id))?.status, 'paused');

  assert.equal(await task.requestResume(id), true);
  assert.equal((await task.get(id))?.status, 'resuming');
  assert.equal(await task.beginStage(id, 'work', 0, 'none'), true);
  assert.equal((await task.get(id))?.status, 'running');

  assert.equal(await task.requestCancel(id), true);
  assert.equal((await task.get(id))?.status, 'canceling');
  await task.markCanceled(id);
  const canceled = await task.get(id);
  assert.equal(canceled?.status, 'canceled');
  assert.equal(canceled?.stages[0]?.status, 'canceled');
});

test('canceling from pending finalizes the run without a Worker', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const taskType = `ts_cancel_${randomUUID().slice(0, 8)}`;
  const id = randomUUID();
  await task.create(id, registration(taskType), { k: 1 });
  await task.plan(id, [{ key: 'work', label: '执行中', total: 5 }]);

  assert.equal(await task.markCanceled(id), true);
  const view = await task.get(id);
  assert.equal(view?.status, 'canceled');
  assert.notEqual(view?.finishedAt, null);
  // A settled cancel cannot be repeated.
  assert.equal(await task.markCanceled(id), false);
});

test('retry reuses the original parameters under a new run', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const taskType = `ts_retry_${randomUUID().slice(0, 8)}`;
  const first = randomUUID();
  await task.create(first, registration(taskType), { k: 7 });
  assert.equal(await task.isRetryable(first), false);
  await task.markCanceled(first);
  assert.equal(await task.isRetryable(first), true);

  const source = await task.parametersOf(first);
  assert.equal(source?.taskType, taskType);
  assert.deepEqual(source?.params, { k: 7 });

  const retryId = randomUUID();
  await task.create(retryId, registration(taskType), source!.params, first);
  const retry = await task.get(retryId);
  assert.equal(retry?.status, 'pending');
  // While the retry is unfinished it is the run the task type reuses.
  assert.equal((await task.findActiveByType(taskType))?.id, retryId);
  assert.equal(await task.isTerminal(retryId), false);
  await endRun(task, retryId);
});

test('latestByTypes returns the newest run of each requested type', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const typeA = `ts_latest_a_${randomUUID().slice(0, 8)}`;
  const typeB = `ts_latest_b_${randomUUID().slice(0, 8)}`;
  const olderA = randomUUID();
  const newerA = randomUUID();
  await task.create(olderA, registration(typeA), { k: 1 });
  await task.markCanceled(olderA);
  await task.create(newerA, registration(typeA), { k: 2 });
  await task.markCanceled(newerA);
  await task.create(randomUUID(), registration(typeB), { k: 1 });

  const latest = await task.latestByTypes([typeA, typeB, 'ts_missing']);
  assert.equal(latest.length, 2);
  assert.equal(latest.find(view => view.taskType === typeA)?.id, newerA);
  await endRun(task, (await task.findActiveByType(typeB))!.id);
});
