import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { _electron as electron } from 'playwright';

/** Exercises the renderer bridge and local navigation in a real Electron app. */
test('opens local management without signing in and restores a closed window', { timeout: 120_000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'console-electron-'));
  let app;
  try {
    app = await electron.launch({
      args:    ['.', '--smoke-test', `--user-data-dir=${profile}`],
      env:     { ...process.env },
      timeout: 60_000,
    });
    app.process().stderr?.on('data', chunk => process.stderr.write(chunk));
    const page = await app.firstWindow();
    page.on('pageerror', error => console.error('Renderer error:', error.message));
    page.on('console', message => {
      if (message.type() === 'error') console.error('Renderer console:', message.text());
    });
    await page.getByText('最近活动', { exact: true }).waitFor({ timeout: 60_000 });
    assert.equal(await page.getByText('游戏数据', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Session unavailable', { exact: true }).count(), 0);
    const health = await page.evaluate(() => window.desktop.runtime.health());
    assert.equal(health.runtime, 'node');
    assert.equal(typeof health.pid, 'number');
    assert.notEqual(health.pid, await app.evaluate(() => process.pid));
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');

    const closed = page.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
    });
    await closed;
    const reopened = app.waitForEvent('window');
    await app.evaluate(({ app }) => {
      app.emit('activate');
    });
    const restored = await reopened;
    await restored.getByText('最近活动', { exact: true }).waitFor({ timeout: 60_000 });
    assert.equal((await restored.evaluate(() => window.desktop.runtime.health())).runtime, 'node');

    // A crashed business process must heal so unfinished runs never look alive forever.
    process.kill(health.pid, 'SIGTERM');
    let revived = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const current = await restored.evaluate(() => window.desktop.runtime.health());
        if (current.pid !== health.pid) {
          revived = current;
          break;
        }
      } catch { /* still restarting */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(revived, 'the business process should restart after crashing');
    assert.equal(revived.runtime, 'node');
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
