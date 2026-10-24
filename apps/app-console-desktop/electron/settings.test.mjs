import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { _electron as electron } from 'playwright';

/** Launches an isolated static application, optionally using the packaged executable. */
async function launch(profile) {
  const executablePath = process.env.ELECTRON_TEST_EXECUTABLE;
  return electron.launch({
    ...(executablePath ? { executablePath, cwd: tmpdir() } : {}),
    args:    [...(executablePath ? [] : ['.']), '--smoke-test', `--user-data-dir=${profile}`],
    env:     { ...process.env, VITE_DEV_SERVER_URL: '' },
    timeout: 60_000,
  });
}
/** Selects a local route through the application's actual hash router. */
async function navigate(page, path) {
  await page.evaluate(value => {
    location.hash = value;
  }, path);
}
/** Invokes the actual native application-menu command shared with its accelerator. */
async function openSettings(app) {
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const item = menu?.getMenuItemById('open-settings');
    if (!item || !menu.items[0].submenu.items.includes(item) || item.accelerator !== 'Command+,') {
      throw new Error('Settings command is missing from the application menu');
    }
    item.click();
  });
}
/** Edits the visible Monaco document through its keyboard interface. */
async function editJson(page, text) {
  const editor = page.locator('.monaco-editor [role="textbox"]').first();
  await editor.waitFor({ state: 'attached' });
  await page.locator('.monaco-editor .view-lines').first().click();
  await editor.focus();
  await page.keyboard.press('Meta+A');
  await editor.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  await page.getByText('有未保存的修改', { exact: true }).waitFor({ timeout: 5000 });
}

test(
  'settings persist after completed edits and JSON protects invalid and unsaved changes',
  { timeout: 120_000 },
  async () => {
    const profile = await mkdtemp(join(tmpdir(), 'console-settings-'));
    let app;
    try {
      app = await launch(profile);
      let page = await app.firstWindow();
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].setSize(1280, 800);
      });
      page.on('pageerror', error => console.error('Renderer:', error.message));
      await page.getByText('最近活动', { exact: true }).waitFor();
      await openSettings(app);
      await page.getByRole('main').getByRole('heading', { name: '设置', exact: true }).waitFor();
      const closed = page.waitForEvent('close');
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].close();
      });
      await closed;
      const reopened = app.waitForEvent('window');
      await openSettings(app);
      page = await reopened;
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].setSize(1280, 800);
      });
      await page.getByRole('main').getByRole('heading', { name: '设置', exact: true }).waitFor();
      console.log('PASS native settings menu, accelerator and closed-window restoration');
      await navigate(page, '/settings/model');
      const model = page.getByLabel('模型名称', { exact: true });
      await model.fill('local-test-model');
      assert.equal((await page.evaluate(() => window.desktop.settings.read())).config.ai.model, undefined);
      await model.press('Tab');
      await page.getByText('已保存', { exact: true }).waitFor();
      assert.equal((await page.evaluate(() => window.desktop.settings.read())).config.ai.model, 'local-test-model');
      const address = page.getByLabel('服务地址', { exact: true });
      await address.fill('not-a-url');
      await address.press('Enter');
      await page.getByRole('alert').filter({ hasText: '模型服务地址内容不正确' }).waitFor();
      assert.equal((await page.evaluate(() => window.desktop.settings.read())).config.ai.baseUrl, undefined);

      await navigate(page, '/settings/data-source');
      const dataRoot = page.getByLabel('数据根目录', { exact: true });
      await dataRoot.fill('/tmp/explicit-data');
      await dataRoot.press('Enter');
      await page.waitForFunction(
        async () => (await window.desktop.settings.read()).config.paths.data === '/tmp/explicit-data',
      );
      await app.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      });
      await page.getByRole('button', { name: '选择目录', exact: true }).first().click();
      assert.equal((await page.evaluate(() => window.desktop.settings.read())).config.paths.data, '/tmp/explicit-data');
      const selected = join(profile, 'selected-data');
      await app.evaluate(({ dialog }, value) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [value] });
      }, selected);
      await page.getByRole('button', { name: '选择目录', exact: true }).first().click();
      await page.waitForFunction(
        async value => (await window.desktop.settings.read()).config.paths.data === value,
        selected,
      );
      console.log('PASS completed field edits, directory selection and cancellation');
      await navigate(page, '/settings/config-file');
      await page.locator('.monaco-editor').waitFor();
      const snapshot = await page.evaluate(() => window.desktop.settings.read());
      await editJson(page, '{"version":1,"ai":{"apiKey":"forbidden-secret"}}');
      console.log('PASS visible JSON editing');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '不支持的项目' }).waitFor();
      assert.deepEqual((await page.evaluate(() => window.desktop.settings.read())).config, snapshot.config);
      await openSettings(app);
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: '保存并离开', exact: true }).click();
      assert.equal(await page.getByRole('dialog').count(), 1);
      await page.getByRole('button', { name: '继续编辑', exact: true }).click();
      assert.ok(page.url().endsWith('/settings/config-file'));

      console.log('PASS invalid JSON and leave cancellation');
      const config = { ...snapshot.config, ai: { model: 'json-test-model' } };
      await editJson(page, JSON.stringify(config, null, 2));
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.getByText('已保存。', { exact: true }).waitFor();
      await editJson(page, JSON.stringify({ ...config, ai: { model: 'unsaved-model' } }));
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].close();
      });
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: '继续编辑', exact: true }).click();
      assert.equal(await page.isClosed(), false);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.reload();
      });
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: '继续编辑', exact: true }).click();
      assert.ok(page.url().endsWith('/settings/config-file'));
      await page.getByRole('link', { name: '数据库', exact: true }).click();
      await page.getByRole('button', { name: '放弃修改', exact: true }).click();
      await page.getByRole('main').getByRole('heading', { name: '数据库设置', exact: true }).waitFor();
      assert.equal((await page.evaluate(() => window.desktop.settings.read())).config.ai.model, 'json-test-model');
      assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
      await page.screenshot({ path: '/private/tmp/console-settings-database.png' });

      console.log('PASS native close protection and discard navigation');
      // A nested frame cannot use the settings gateway.
      const denied = await app.evaluate(async ({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        await contents.executeJavaScript(
          'new Promise(resolve => { const frame = document.createElement(\'iframe\'); frame.src = location.href; frame.onload = () => resolve(null); document.body.appendChild(frame); })',
        );
        const frame = contents.mainFrame.frames[0];
        return frame.executeJavaScript(
          'typeof window.desktop === \'undefined\' ? \'denied\' : window.desktop.settings.read().then(() => \'allowed\', () => \'denied\')',
        );
      });
      assert.equal(denied, 'denied');
      console.log('PASS frame isolation');
      await app.close();
      app = await launch(profile);
      page = await app.firstWindow();
      await page.getByText('最近活动', { exact: true }).waitFor();
      await navigate(page, '/settings/model');
      await page.getByLabel('模型名称', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('模型名称', { exact: true }).inputValue(), 'json-test-model');
      const persisted = await readFile(join(profile, 'settings.json'), 'utf8');
      assert.equal(persisted.includes('forbidden-secret'), false);
    } finally {
      if (app && app.process().exitCode === null) {
        const exited = new Promise(resolve => app.process().once('exit', resolve));
        app.process().kill('SIGKILL');
        await exited;
      }
      await rm(profile, { recursive: true, force: true });
    }
  },
);

test(
  'encrypts temporary credentials while public JSON and restart preserve the secret boundary',
  { timeout: 60_000 },
  async () => {
    const profile = await mkdtemp(join(tmpdir(), 'console-settings-crypto-'));
    let app;
    try {
      app = await launch(profile);
      const page = await app.firstWindow();
      await page.getByText('最近活动', { exact: true }).waitFor();
      await navigate(page, '/settings/model');
      const key = page.getByLabel('API Key', { exact: true });
      await key.fill('isolated-encryption-test-value');
      await key.press('Tab');
      await page.waitForFunction(
        async () => (await window.desktop.settings.read()).credentials.ai === true,
        undefined,
        { timeout: 15_000 },
      );
      const snapshot = await page.evaluate(() => window.desktop.settings.read());
      assert.equal(JSON.stringify(snapshot).includes('isolated-encryption-test-value'), false);
      await page.evaluate(
        value => window.desktop.settings.saveJson(JSON.stringify(value.config), value.revision),
        snapshot,
      );
      assert.equal((await page.evaluate(() => window.desktop.settings.read())).credentials.ai, true);
      const file = await readFile(join(profile, 'settings.json'), 'utf8');
      assert.equal(file.includes('isolated-encryption-test-value'), false);
      await app.close();
      app = await launch(profile);
      const restored = await app.firstWindow();
      await restored.getByText('最近活动', { exact: true }).waitFor();
      assert.equal((await restored.evaluate(() => window.desktop.settings.read())).credentials.ai, true);
      assert.equal(
        await app.evaluate(async ({ app, safeStorage }) => {
          const fs = process.getBuiltinModule('fs');
          const stored = JSON.parse(fs.readFileSync(`${app.getPath('userData')}/settings.json`, 'utf8'));
          return (
            (await safeStorage.decryptStringAsync(Buffer.from(stored.secrets.ai, 'base64'))).result
            === 'isolated-encryption-test-value'
          );
        }),
        true,
      );
      assert.equal(
        await app.evaluate(async ({ safeStorage }) => {
          const sealed = await safeStorage.encryptStringAsync('isolated-roundtrip');
          return (await safeStorage.decryptStringAsync(sealed)).result === 'isolated-roundtrip';
        }),
        true,
      );
    } finally {
      if (app && app.process().exitCode === null) {
        const exited = new Promise(resolve => app.process().once('exit', resolve));
        app.process().kill('SIGKILL');
        await exited;
      }
      await rm(profile, { recursive: true, force: true });
    }
  },
);
