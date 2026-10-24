import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { _electron as electron } from 'playwright';

const databaseUrl = () => process.env.DATABASE_URL;

/** Launch options shared by every task regression. */
async function launchConsole() {
  const profile = await mkdtemp(join(tmpdir(), 'console-tasks-'));
  const executablePath = process.env.ELECTRON_TEST_EXECUTABLE;
  const app = await electron.launch({
    ...(executablePath ? { executablePath, cwd: tmpdir() } : {}),
    args:    [...(executablePath ? [] : ['.']), '--smoke-test', `--user-data-dir=${profile}`],
    env:     { ...process.env, VITE_DEV_SERVER_URL: '' },
    timeout: 60_000,
  });
  app.process().stderr?.on('data', chunk => process.stderr.write(chunk));
  const page = await app.firstWindow();
  await page.getByText('最近活动', { exact: true }).waitFor();
  await page.evaluate(url => window.desktop.settings.setSecret('database', url), databaseUrl());
  return { app, page, profile };
}

/** Clears leftover unfinished development runs so one test cannot occupy another. */
async function clearDevelopmentRuns(page) {
  const active = await page.evaluate(() => window.desktop.tasks.list());
  for (const task of active) {
    if (task.taskType.startsWith('dev_')) {
      await page.evaluate(id => window.desktop.tasks.control(id, 'cancel').catch(() => {}), task.id);
    }
  }
}

/** Polls one task run until it reaches one of the expected statuses. */
async function waitForStatus(page, taskRunId, statuses, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const task = await page.evaluate(id => window.desktop.tasks.get(id), taskRunId);
    if (statuses.includes(task?.status)) return task;
    if (task?.status === 'failed') throw new Error(task.errorMessage ?? 'Task failed');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Task ${taskRunId} never reached ${statuses.join('/')}`);
}

/** Locates the launch row of one development task type. */
const typeRow = (page, label) => page.locator('div.flex-wrap', { has: page.getByText(label, { exact: true }) });

/** The launch button label depends on the latest persisted run of the type. */
const launchButton = (page, label) => typeRow(page, label).getByRole('button', { name: /^运行$|^再次运行$|^按当前参数新建$/ });

/** Runs the task through the real window, private IPC, host and Worker. */
test('starts a registered task and shows it globally until completion', {
  timeout: 120_000,
  skip:    !databaseUrl(),
}, async () => {
  const { app, page, profile } = await launchConsole();
  try {
    await clearDevelopmentRuns(page);
    await page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });

    await page.getByRole('heading', { name: '测试任务' }).waitFor();
    const idPromise = page.evaluate(() => new Promise(resolve => {
      const stop = window.desktop.tasks.onChange(task => {
        if (task.taskType === 'dev_sample') {
          stop();
          resolve(task.id);
        }
      });
    }));
    await launchButton(page, '测试任务').click();
    const id = await idPromise;
    await waitForStatus(page, id, ['running']);
    await page.reload();
    await page.getByRole('heading', { name: '测试任务' }).waitFor();
    await page.evaluate(() => {
      window.location.hash = '#/tasks';
    });
    await page.getByRole('heading', { name: '当前任务' }).waitFor();
    await page.getByText('测试任务', { exact: true }).waitFor();
    const completed = await waitForStatus(page, id, ['completed']);
    assert.equal(completed.stages[0].done, 10);
    assert.equal(completed.stages[0].status, 'completed');
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

/** One task type stays single-instance and occupies the whole multi-type control. */
test('reuses the unfinished run of a task type and blocks the control until it ends', {
  timeout: 180_000,
  skip:    !databaseUrl(),
}, async () => {
  const { app, page, profile } = await launchConsole();
  try {
    await clearDevelopmentRuns(page);
    await page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await page.getByRole('heading', { name: '测试任务' }).waitFor();

    await page.getByRole('spinbutton').fill('15');
    await launchButton(page, '测试任务').click();
    // The host row appears a moment after the accepted identity reaches the page.
    let first;
    for (let attempt = 0; attempt < 80; attempt++) {
      const active = await page.evaluate(() => window.desktop.tasks.list());
      first = active.find(task => task.taskType === 'dev_sample');
      if (first) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(first, 'the started run should appear in the host list');
    await waitForStatus(page, first.id, ['running']);

    // A competing creation with a different scope returns the existing run instead of starting another.
    const competing = await page.evaluate(params => window.desktop.tasks.start('dev_sample', params), { steps: 5 });
    assert.equal(competing.existing, true);
    assert.equal(competing.taskRunId, first.id);
    const active = await page.evaluate(() => window.desktop.tasks.list());
    assert.equal(active.filter(task => task.taskType === 'dev_sample').length, 1);

    // While any type of the control is unfinished its other launch operations are unavailable.
    assert.equal(await page.getByRole('button', { name: '运行', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '按当前参数新建' }).count(), 0);

    // Another page and a rebuilt page still recognize the occupying run.
    await page.evaluate(() => {
      window.location.hash = '#/tasks';
    });
    await page.getByText('测试任务', { exact: true }).first().waitFor();
    await page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await page.getByRole('button', { name: '取消' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: '测试任务' }).waitFor();
    await page.getByRole('button', { name: '取消' }).waitFor();

    await page.getByRole('button', { name: '取消' }).click();
    await waitForStatus(page, first.id, ['canceled']);

    // Retrying runs a new run with the original parameters.
    await typeRow(page, '测试任务').getByRole('button', { name: '重试' }).click();
    await page.getByRole('button', { name: '取消' }).waitFor();
    let retry;
    for (let attempt = 0; attempt < 80; attempt++) {
      const latest = await page.evaluate(() => window.desktop.tasks.latestByTypes(['dev_sample']));
      if (latest[0] && latest[0].id !== first.id) {
        retry = latest[0];
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(retry, 'the retried run should replace the canceled one');
    await waitForStatus(page, retry.id, ['running']);
    assert.equal((await page.evaluate(id => window.desktop.tasks.get(id), retry.id)).stages[0].total, 15);
    await waitForStatus(page, retry.id, ['completed']);

    // Running again uses the current page parameters.
    await page.getByRole('spinbutton').fill('3');
    await typeRow(page, '测试任务').getByRole('button', { name: '再次运行' }).click();
    await page.getByRole('button', { name: '取消' }).waitFor();
    let again;
    for (let attempt = 0; attempt < 80; attempt++) {
      const latest = await page.evaluate(() => window.desktop.tasks.latestByTypes(['dev_sample']));
      if (latest[0] && latest[0].id !== retry.id) {
        again = latest[0];
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(again, 'the repeated run should appear as a new run');
    await waitForStatus(page, again.id, ['running']);
    assert.equal((await page.evaluate(id => window.desktop.tasks.get(id), again.id)).stages[0].total, 3);
    await waitForStatus(page, again.id, ['completed']);
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

/** Pause keeps persisted progress and continue finishes the same run. */
test('pauses at a safe boundary and continues from persisted progress', {
  timeout: 180_000,
  skip:    !databaseUrl(),
}, async () => {
  const { app, page, profile } = await launchConsole();
  try {
    await clearDevelopmentRuns(page);
    await page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await page.getByRole('heading', { name: '测试任务' }).waitFor();

    await page.getByRole('spinbutton').fill('12');
    await launchButton(page, '测试任务').click();
    let run;
    for (let attempt = 0; attempt < 80; attempt++) {
      const active = await page.evaluate(() => window.desktop.tasks.list());
      run = active.find(task => task.taskType === 'dev_sample');
      if (run && run.status === 'running' && (run.stages[0]?.done ?? 0) >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(run?.status, 'running');

    await page.getByRole('button', { name: '暂停' }).click();
    const paused = await waitForStatus(page, run.id, ['paused']);
    const pausedDone = paused.stages[0].done;
    assert.ok(pausedDone >= 2 && pausedDone < 12);

    await new Promise(resolve => setTimeout(resolve, 900));
    const still = await page.evaluate(id => window.desktop.tasks.get(id), run.id);
    assert.equal(still.status, 'paused');
    assert.equal(still.stages[0].done, pausedDone);

    await page.evaluate(() => {
      window.location.hash = '#/tasks';
    });
    await page.getByText('已暂停').first().waitFor();
    await page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await page.getByRole('button', { name: '继续' }).click();

    const finished = await waitForStatus(page, run.id, ['completed'], 160);
    assert.equal(finished.stages[0].done, 12);
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
