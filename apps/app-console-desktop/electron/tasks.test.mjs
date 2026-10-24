import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { _electron as electron } from 'playwright';

/** Runs the task through the real window, private IPC, host and Worker. */
test('starts a registered task and shows it globally until completion', {
  timeout: 120_000,
  skip:    !process.env.DATABASE_URL,
}, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'console-tasks-'));
  let app;
  try {
    const executablePath = process.env.ELECTRON_TEST_EXECUTABLE;
    app = await electron.launch({
      ...(executablePath ? { executablePath, cwd: tmpdir() } : {}),
      args:    [...(executablePath ? [] : ['.']), '--smoke-test', `--user-data-dir=${profile}`],
      env:     { ...process.env, VITE_DEV_SERVER_URL: '' },
      timeout: 60_000,
    });
    app.process().stderr?.on('data', chunk => process.stderr.write(chunk));
    const page = await app.firstWindow();
    await page.getByText('最近活动', { exact: true }).waitFor();
    await page.evaluate(url => window.desktop.settings.setSecret('database', url), process.env.DATABASE_URL);

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
    await page.getByRole('button', { name: '运行测试任务' }).click();
    const id = await idPromise;
    let running = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const task = await page.evaluate(taskRunId => window.desktop.tasks.get(taskRunId), id);
      if (task?.status === 'running') {
        running = true;
        break;
      }
      if (task?.status === 'failed') throw new Error(task.errorMessage ?? 'Task failed');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(running, true);
    await page.reload();
    await page.getByRole('heading', { name: '测试任务' }).waitFor();
    await page.evaluate(() => {
      window.location.hash = '#/tasks';
    });
    await page.getByRole('heading', { name: '当前任务' }).waitFor();
    await page.getByText('测试任务', { exact: true }).waitFor();
    let completedState = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const task = await page.evaluate(taskRunId => window.desktop.tasks.get(taskRunId), id);
      if (task?.status === 'completed') {
        completedState = true;
        break;
      }
      if (task?.status === 'failed') throw new Error(task.errorMessage ?? 'Task failed');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(completedState, true);
    const completed = await page.evaluate(taskRunId => window.desktop.tasks.get(taskRunId), id);
    assert.equal(completed.stages[0].done, 10);
    assert.equal(completed.stages[0].status, 'completed');
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
