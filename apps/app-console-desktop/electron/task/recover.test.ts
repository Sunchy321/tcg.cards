import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { createDb } from '@tcg-cards/db';
import { TaskRun } from '@tcg-cards/db/schema/local/task';
import { eq } from 'drizzle-orm';

import { recoverUnfinishedRuns } from './recover.ts';
import { TaskStore } from './store.ts';
import type { TaskRegistration } from './registry.ts';

/** Unique task types keep test rows from colliding with real console runs. */
function registration(taskType: string, version = '1'): TaskRegistration {
  return {
    taskType,
    label:          taskType,
    version,
    supportsResume: false,
    scope:          params => ({ type: 'test', key: String(params.k ?? 'x') }),
    load:           async () => { throw new Error('Definitions are not needed here'); },
  };
}

function store(): TaskStore {
  return new TaskStore(process.env.DATABASE_URL!);
}

/** Reads the persisted terminal reason of one run for transition assertions. */
async function reasonOf(id: string): Promise<string | null> {
  const [row] = await createDb(process.env.DATABASE_URL!).select({ terminalReason: TaskRun.terminalReason })
    .from(TaskRun).where(eq(TaskRun.id, id)).limit(1);
  return row?.terminalReason ?? null;
}

/** Leaves one run stopped inside its first stage the way a dying Worker would. */
async function stoppedRun(
  task: TaskStore,
  taskType: string,
  resumeMode: 'none' | 'durable',
  options: { paused?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  await task.create(id, registration(taskType), { k: 1 });
  await task.plan(id, [{ key: 'work', label: '执行中', total: 5, resumeMode }]);
  await task.beginStage(id, 'work', 0);
  await task.progress(id, 'work', 3);
  if (options.paused) {
    await task.requestPause(id);
    await task.markPaused(id, 'work', resumeMode);
  }
  return id;
}

test('a stale run with a durable checkpoint becomes interrupted and keeps its slot', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const taskType = `ts_recover_durable_${randomUUID().slice(0, 8)}`;
  const id = await stoppedRun(task, taskType, 'durable');
  const known = new Map([[taskType, registration(taskType)]]);

  await recoverUnfinishedRuns(task, type => known.get(type));
  const interrupted = await task.get(id);
  assert.equal(interrupted?.status, 'interrupted');
  assert.equal(interrupted?.stages[0]?.status, 'paused');
  assert.equal(interrupted?.stages[0]?.done, 3);
  // The interrupted run still occupies the single unfinished slot of its type.
  assert.equal((await task.findActiveByType(taskType))?.id, id);
  await assert.rejects(task.create(randomUUID(), registration(taskType), { k: 2 }));

  // A later boot keeps the run waiting instead of touching it again.
  await recoverUnfinishedRuns(task, type => known.get(type));
  assert.equal((await task.get(id))?.status, 'interrupted');

  // A manual continue transitions it out of interrupted.
  assert.equal(await task.requestResume(id), true);
  assert.equal((await task.get(id))?.status, 'resuming');
  await task.markCanceled(id);
});

test('a stale run without a durable checkpoint is abandoned and frees its slot', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const taskType = `ts_recover_stale_${randomUUID().slice(0, 8)}`;
  const id = await stoppedRun(task, taskType, 'none');
  const known = new Map([[taskType, registration(taskType)]]);

  await recoverUnfinishedRuns(task, type => known.get(type));
  const abandoned = await task.get(id);
  assert.equal(abandoned?.status, 'abandoned');
  assert.equal(abandoned?.stages[0]?.status, 'abandoned');
  assert.equal(await reasonOf(id), 'abandoned_stale_run');
  assert.equal(await task.findActiveByType(taskType), null);
  // Creating a new run of the freed type needs no extra ceremony.
  const next = await task.create(randomUUID(), registration(taskType), { k: 2 });
  assert.equal(next.status, 'pending');
  await task.markCanceled(next.id);
});

test('a manually paused durable run keeps its pause across boots', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const taskType = `ts_recover_paused_${randomUUID().slice(0, 8)}`;
  const id = await stoppedRun(task, taskType, 'durable', { paused: true });
  const known = new Map([[taskType, registration(taskType)]]);

  await recoverUnfinishedRuns(task, type => known.get(type));
  const paused = await task.get(id);
  assert.equal(paused?.status, 'paused');
  assert.equal(paused?.stages[0]?.done, 3);
  await task.markCanceled(id);
});

test('a manually paused run without a durable contract loses its context and is abandoned', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const taskType = `ts_recover_paused_lost_${randomUUID().slice(0, 8)}`;
  const id = await stoppedRun(task, taskType, 'none', { paused: true });
  const known = new Map([[taskType, registration(taskType)]]);

  await recoverUnfinishedRuns(task, type => known.get(type));
  assert.equal((await task.get(id))?.status, 'abandoned');
  assert.equal(await reasonOf(id), 'resume_context_lost');
  assert.equal(await task.findActiveByType(taskType), null);
});

test('runs whose definition changed or vanished are abandoned as incompatible', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const task = store();
  const changed = `ts_recover_version_${randomUUID().slice(0, 8)}`;
  const removed = `ts_recover_unknown_${randomUUID().slice(0, 8)}`;
  const changedId = await stoppedRun(task, changed, 'durable');
  const removedId = await stoppedRun(task, removed, 'durable', { paused: true });
  const known = new Map([[changed, registration(changed, '2')]]);

  await recoverUnfinishedRuns(task, type => known.get(type));
  assert.equal((await task.get(changedId))?.status, 'abandoned');
  assert.equal(await reasonOf(changedId), 'resume_incompatible');
  assert.equal((await task.get(removedId))?.status, 'abandoned');
  assert.equal(await reasonOf(removedId), 'resume_incompatible');
  assert.equal(await task.findActiveByType(changed), null);
  assert.equal(await task.findActiveByType(removed), null);
});
