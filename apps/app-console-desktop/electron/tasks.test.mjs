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
  // Cleanup closes must never block on the native quit confirmation.
  await patchQuitDialog(app, 1);
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

/** Waits until one task type is running with persisted progress to continue from. */
async function waitForRunning(page, taskType, minDone, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const active = await page.evaluate(() => window.desktop.tasks.list());
    const run = active.find(task => task.taskType === taskType);
    if (run && run.status === 'running' && (run.stages[0]?.done ?? 0) >= minDone) return run;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Task ${taskType} never reached running`);
}

/** Quits the app the way a real crash does: the task host and Workers die mid-run. */
async function restartApp(session) {
  session.app.process().kill('SIGKILL');
  await waitForExit(session.app);
  await rm(session.profile, { recursive: true, force: true });
}

/** Steers the native quit confirmation without a visible dialog. */
async function patchQuitDialog(app, response) {
  await app.evaluate(({ dialog }, choice) => {
    if (!dialog.__originalMessageBox) dialog.__originalMessageBox = dialog.showMessageBox;
    dialog.showMessageBox = async () => ({ response: choice });
  }, response);
}

/** Puts the native quit confirmation back so later closes can quit normally. */
async function restoreQuitDialog(app) {
  await app.evaluate(({ dialog }) => {
    if (dialog.__originalMessageBox) {
      dialog.showMessageBox = dialog.__originalMessageBox;
      dialog.__originalMessageBox = undefined;
    }
  });
}

/** Resolves once the Electron process really exited after a confirmed quit. */
async function waitForExit(app) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the app did not exit')), 60_000);
    app.process().once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
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

/** A durable run survives an app restart as interrupted and continues from its checkpoint. */
test('marks a durable run interrupted after a restart and continues from persisted progress', {
  timeout: 300_000,
  skip:    !databaseUrl(),
}, async () => {
  const first = await launchConsole();
  let run;
  try {
    await clearDevelopmentRuns(first.page);
    await first.page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await first.page.getByRole('heading', { name: '测试任务' }).waitFor();
    await first.page.getByRole('spinbutton').fill('40');
    await launchButton(first.page, '测试任务').click();
    run = await waitForRunning(first.page, 'dev_sample', 2);
  } finally {
    await restartApp(first);
  }

  const second = await launchConsole();
  try {
    const interrupted = await waitForStatus(second.page, run.id, ['interrupted']);
    const persistedDone = interrupted.stages[0].done;
    assert.ok(persistedDone >= 2 && persistedDone < 40);
    assert.equal(interrupted.stages[0].status, 'paused');

    // The run never resumes on its own after a restart.
    await new Promise(resolve => setTimeout(resolve, 1_500));
    const waiting = await second.page.evaluate(id => window.desktop.tasks.get(id), run.id);
    assert.equal(waiting.status, 'interrupted');

    await second.page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await second.page.getByRole('heading', { name: '测试任务' }).waitFor();
    await second.page.getByText('已中断，等待继续').first().waitFor();
    await second.page.getByRole('button', { name: '继续' }).click();

    // Continuation resumes at the checkpoint instead of redoing the stage.
    let running;
    for (let attempt = 0; attempt < 80; attempt++) {
      const current = await second.page.evaluate(id => window.desktop.tasks.get(id), run.id);
      if (current?.status === 'running') {
        running = current;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(running, 'the continued run should reach running');
    assert.ok(running.stages[0].done >= persistedDone, 'continuation must not redo persisted progress');
    const finished = await waitForStatus(second.page, run.id, ['completed'], 160);
    assert.equal(finished.stages[0].done, 40);
  } finally {
    await second.app?.close();
    await rm(second.profile, { recursive: true, force: true });
  }
});

/** A run without a durable checkpoint is abandoned by a restart and its task type is freed. */
test('abandons an unrecoverable run after a restart and accepts a new one without ceremony', {
  timeout: 300_000,
  skip:    !databaseUrl(),
}, async () => {
  const first = await launchConsole();
  let run;
  try {
    await clearDevelopmentRuns(first.page);
    await first.page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await first.page.getByRole('heading', { name: '测试任务' }).waitFor();
    await first.page.getByRole('spinbutton').fill('30');
    await launchButton(first.page, '测试任务 B').click();
    run = await waitForRunning(first.page, 'dev_sample_b', 2);
  } finally {
    await restartApp(first);
  }

  const second = await launchConsole();
  try {
    const abandoned = await waitForStatus(second.page, run.id, ['abandoned']);
    assert.equal(abandoned.stages[0].status, 'abandoned');

    // The freed task type starts a fresh run without an existing-run prompt.
    const started = await second.page.evaluate(
      params => window.desktop.tasks.start('dev_sample_b', params),
      { steps: 3 },
    );
    assert.equal(started.existing, false);
    assert.notEqual(started.taskRunId, run.id);
    const finished = await waitForStatus(second.page, started.taskRunId, ['completed'], 160);
    assert.equal(finished.stages[0].done, 3);
  } finally {
    await second.app?.close();
    await rm(second.profile, { recursive: true, force: true });
  }
});

/** A manually paused durable run keeps its pause across a restart and still continues. */
test('keeps a manually paused run paused across a restart and continues it', {
  timeout: 300_000,
  skip:    !databaseUrl(),
}, async () => {
  const first = await launchConsole();
  let run;
  try {
    await clearDevelopmentRuns(first.page);
    await first.page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await first.page.getByRole('heading', { name: '测试任务' }).waitFor();
    await first.page.getByRole('spinbutton').fill('20');
    await launchButton(first.page, '测试任务').click();
    run = await waitForRunning(first.page, 'dev_sample', 2);
    await first.page.getByRole('button', { name: '暂停' }).click();
    await waitForStatus(first.page, run.id, ['paused']);
  } finally {
    await restartApp(first);
  }

  const second = await launchConsole();
  try {
    const paused = await waitForStatus(second.page, run.id, ['paused']);
    const persistedDone = paused.stages[0].done;
    assert.ok(persistedDone >= 2 && persistedDone < 20);

    await second.page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await second.page.getByRole('heading', { name: '测试任务' }).waitFor();
    await second.page.getByText('已暂停', { exact: true }).first().waitFor();
    await second.page.getByRole('button', { name: '继续' }).click();

    let running;
    for (let attempt = 0; attempt < 80; attempt++) {
      const current = await second.page.evaluate(id => window.desktop.tasks.get(id), run.id);
      if (current?.status === 'running') {
        running = current;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(running, 'the paused run should continue after the restart');
    assert.ok(running.stages[0].done >= persistedDone, 'continuation must not redo persisted progress');
    const finished = await waitForStatus(second.page, run.id, ['completed'], 160);
    assert.equal(finished.stages[0].done, 20);
  } finally {
    await second.app?.close();
    await rm(second.profile, { recursive: true, force: true });
  }
});

/** Closing the window leaves the task host running; reopening reads its live state. */
test('keeps tasks running behind a closed window and reads live state after reopening', {
  timeout: 180_000,
  skip:    !databaseUrl(),
}, async () => {
  const { app, page, profile } = await launchConsole();
  let reopened = null;
  try {
    await clearDevelopmentRuns(page);
    await page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await page.getByRole('heading', { name: '测试任务' }).waitFor();
    await page.getByRole('spinbutton').fill('12');
    await launchButton(page, '测试任务').click();
    const run = await waitForRunning(page, 'dev_sample', 2);

    await page.close();
    // The destroyed window is nulled asynchronously; wait before asking for a new one.
    for (let attempt = 0; attempt < 40; attempt++) {
      const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
      if (windows === 0) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    await app.evaluate(electron => electron.app.emit('activate'));
    reopened = await app.waitForEvent('window', { timeout: 30_000 });
    await reopened.getByText('最近活动', { exact: true }).waitFor();

    const behind = await reopened.evaluate(id => window.desktop.tasks.get(id), run.id);
    assert.equal(behind.status, 'running');
    assert.ok(behind.stages[0].done >= run.stages[0].done);
    const finished = await waitForStatus(reopened, run.id, ['completed'], 160);
    assert.equal(finished.stages[0].done, 12);
  } finally {
    await app?.close();
    await reopened?.close().catch(() => {});
    await rm(profile, { recursive: true, force: true });
  }
});

/** Quitting with unfinished tasks asks first; canceling leaves the run untouched. */
test('asks before quitting with unfinished tasks and keeps them running when canceled', {
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
    const run = await waitForRunning(page, 'dev_sample', 2);

    await patchQuitDialog(app, 0);
    await app.evaluate(electron => electron.app.quit());
    // A canceled confirmation must leave the app and the run exactly as they were.
    await new Promise(resolve => setTimeout(resolve, 1_500));
    assert.equal(app.process().exitCode, null, 'the app should still be running');
    const untouched = await page.evaluate(id => window.desktop.tasks.get(id), run.id);
    assert.equal(untouched.status, 'running');
    const finished = await waitForStatus(page, run.id, ['completed'], 160);
    assert.equal(finished.stages[0].done, 12);
  } finally {
    await restoreQuitDialog(app).catch(() => {});
    if (app.process().exitCode === null) await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});

/** A confirmed quit stops at safe boundaries; the next boot waits for a manual continue. */
test('winds unfinished tasks down on a confirmed quit and waits for manual continue', {
  timeout: 300_000,
  skip:    !databaseUrl(),
}, async () => {
  const first = await launchConsole();
  await clearDevelopmentRuns(first.page);
  await first.page.evaluate(() => Promise.all([
    window.desktop.tasks.start('dev_sample', { steps: 40 }),
    window.desktop.tasks.start('dev_sample_b', { steps: 40 }),
  ]));
  const durable = await waitForRunning(first.page, 'dev_sample', 2);
  const fragile = await waitForRunning(first.page, 'dev_sample_b', 2);
  await patchQuitDialog(first.app, 1);
  await first.app.evaluate(electron => electron.app.quit());
  await waitForExit(first.app);
  await rm(first.profile, { recursive: true, force: true });

  const second = await launchConsole();
  try {
    // The durable run waits at its checkpoint; the fragile one is abandoned and frees its type.
    const interrupted = await waitForStatus(second.page, durable.id, ['interrupted']);
    const persistedDone = interrupted.stages[0].done;
    assert.ok(persistedDone >= 2 && persistedDone < 40);
    assert.equal(interrupted.stages[0].status, 'paused');
    const abandoned = await waitForStatus(second.page, fragile.id, ['abandoned']);
    assert.equal(abandoned.stages[0].status, 'abandoned');

    // Nothing continues on its own after the restart.
    await new Promise(resolve => setTimeout(resolve, 1_500));
    const waiting = await second.page.evaluate(id => window.desktop.tasks.get(id), durable.id);
    assert.equal(waiting.status, 'interrupted');

    await second.page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await second.page.getByRole('heading', { name: '测试任务' }).waitFor();
    await second.page.getByText('已中断，等待继续').first().waitFor();
    await second.page.getByRole('button', { name: '继续' }).click();

    let running;
    for (let attempt = 0; attempt < 80; attempt++) {
      const current = await second.page.evaluate(id => window.desktop.tasks.get(id), durable.id);
      if (current?.status === 'running') {
        running = current;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(running, 'the continued run should reach running');
    assert.ok(running.stages[0].done >= persistedDone, 'continuation must not redo persisted progress');
    const finished = await waitForStatus(second.page, durable.id, ['completed'], 160);
    assert.equal(finished.stages[0].done, 40);
  } finally {
    await second.app?.close();
    await rm(second.profile, { recursive: true, force: true });
  }
});

/** A crashed task host restarts, reclassifies its runs and stays usable. */
test('restarts a crashed task host so runs stop looking alive and can continue', {
  timeout: 300_000,
  skip:    !databaseUrl(),
}, async () => {
  const { app, page, profile } = await launchConsole();
  try {
    await clearDevelopmentRuns(page);
    await page.evaluate(() => {
      window.desktop.tasks.start('dev_sample', { steps: 40 });
    });
    const run = await waitForRunning(page, 'dev_sample', 2);
    const before = await page.evaluate(() => window.desktop.runtime.health());

    // Killing the host kills its Workers; the replacement host must reclassify the run.
    process.kill(before.pid, 'SIGKILL');
    const interrupted = await waitForStatus(page, run.id, ['interrupted'], 160);
    assert.ok(interrupted.stages[0].done >= 2, 'the persisted checkpoint should survive the crash');

    let revived = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const current = await page.evaluate(() => window.desktop.runtime.health());
        if (current.pid !== before.pid) {
          revived = current;
          break;
        }
      } catch { /* still restarting */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(revived, 'the task host should restart after crashing');

    await page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await page.getByRole('heading', { name: '测试任务' }).waitFor();
    await page.getByText('已中断，等待继续').first().waitFor();
    await page.getByRole('button', { name: '继续' }).click();
    const finished = await waitForStatus(page, run.id, ['completed'], 160);
    assert.equal(finished.stages[0].done, 40);
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

/** A Worker that dies mid-run becomes a visible failure instead of a fake running state. */
test('marks a run failed when its Worker dies unexpectedly', {
  timeout: 180_000,
  skip:    !databaseUrl(),
}, async () => {
  const { app, page, profile } = await launchConsole();
  try {
    await clearDevelopmentRuns(page);
    await page.evaluate(() => {
      window.desktop.tasks.start('dev_sample_crash', {});
    });
    let run;
    for (let attempt = 0; attempt < 80; attempt++) {
      const active = await page.evaluate(() => window.desktop.tasks.list());
      run = active.find(task => task.taskType === 'dev_sample_crash');
      if (run) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(run, 'the crash task should appear in the host list');
    const failed = await waitForStatus(page, run.id, ['failed']);
    assert.match(failed.errorMessage ?? '', /执行环境/);
    assert.equal(failed.stages[0].done, 1);
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
