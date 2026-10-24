import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem, net, protocol } from 'electron';
import Store from 'electron-store';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { HEALTH_CHANNEL, OPEN_SETTINGS, CLOSE_REQUESTED, TASK_CHANNEL, TASK_CHANGED_CHANNEL } from './contract';
import type { TaskView } from './contract';
import { RuntimeClient } from './runtime-client';
import { Settings } from './settings';
import { credentials } from './credentials';
import { inheritSettings } from './legacy-settings';
import { legacySources } from './legacy-sources';
import { registerSettings } from './settings-ipc';
import { verifyDevelopment } from './development-trust';
import type { IpcMainInvokeEvent } from 'electron';

protocol.registerSchemesAsPrivileged([
  { scheme: 'tcg-console', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let dirty = false;
let quitting = false;
let unloadIntent: 'close' | 'reload' | null = null;
let mainWindow: BrowserWindow | null = null;
let runtime: RuntimeClient | null = null;
const developmentUrl = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL || undefined : undefined;
const rendererUrl = developmentUrl ?? 'tcg-console://app/index.html';
const rendererOrigin = new URL(rendererUrl).origin;
const smokeTest = process.argv.includes('--smoke-test');

/** Restricts navigation and privileged IPC to the app's own renderer document. */
function isAppUrl(value: string) {
  const url = new URL(value);
  return developmentUrl ? url.origin === rendererOrigin : url.protocol === 'tcg-console:' && url.hostname === 'app';
}

/** Creates or focuses the existing management window without requiring a session. */
function openMainWindow(settings = false) {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const window = new BrowserWindow({
    title:          'TCG Cards Console',
    show:           false,
    webPreferences: {
      preload:          resolve(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  });
  mainWindow = window;
  unloadIntent = null;
  if (!smokeTest) {
    window.maximize();
    window.once('ready-to-show', () => window.show());
  }
  window.on('close', event => {
    unloadIntent = 'close';
    if (!dirty) return;
    event.preventDefault();
    window.webContents.send(CLOSE_REQUESTED);
  });
  window.webContents.on('will-prevent-unload', () => {
    unloadIntent ??= 'reload';
    window.webContents.send(CLOSE_REQUESTED);
  });
  window.on('closed', () => {
    mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  const url = new URL(rendererUrl);
  if (settings) url.hash = '/settings';
  void window.loadURL(url.href);
}

/** Opens settings through the router so existing unsaved-change guards still apply. */
function openSettings() {
  if (!mainWindow) {
    openMainWindow(true);
    return;
  }
  const window = mainWindow;
  openMainWindow();
  /** Delivers the request only after the preload has registered its listener. */
  const send = () => {
    if (!window.isDestroyed()) window.webContents.send(OPEN_SETTINGS);
  };
  if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', send);
  else send();
}

/** Extends the standard macOS application menu while preserving its other commands. */
function installSettingsMenu() {
  if (process.platform !== 'darwin') return;
  const menu = Menu.getApplicationMenu();
  const application = menu?.items[0];
  if (!menu || !application?.submenu) return;
  const items = application.submenu.items;
  const submenu = new Menu();
  for (const item of items.slice(0, 2)) submenu.append(item);
  submenu.append(new MenuItem({ id: 'open-settings', label: '设置…', accelerator: 'Command+,', click: openSettings }));
  submenu.append(new MenuItem({ type: 'separator' }));
  for (const item of items.slice(2)) submenu.append(item);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: application.label, submenu }, ...menu.items.slice(1)]));
}

/** Rechecks the current main frame and development-server identity for privileged IPC. */
async function authorize(event: IpcMainInvokeEvent) {
  if (
    !mainWindow
    || event.sender !== mainWindow.webContents
    || event.senderFrame !== mainWindow.webContents.mainFrame
    || !isAppUrl(event.senderFrame.url)
  )
    throw new Error('无法授权此操作。');
  if (developmentUrl) await verifyDevelopment(developmentUrl, process.env.CONSOLE_DEV_IDENTITY);
}

let startupPhase = 'development';
app
  .whenReady()
  .then(async () => {
    if (developmentUrl) await verifyDevelopment(developmentUrl, process.env.CONSOLE_DEV_IDENTITY, 15_000);
    startupPhase = 'settings';
    const publicDir = resolve(app.getAppPath(), '.output/public');
    protocol.handle('tcg-console', request => {
      const url = new URL(request.url);
      const path = resolve(publicDir, `.${decodeURIComponent(url.pathname)}`);
      if (url.hostname !== 'app' || !path.startsWith(`${publicDir}${sep}`)) {
        return new Response(null, { status: 403 });
      }
      return net.fetch(pathToFileURL(path).href);
    });
    const store = new Store<Record<string, unknown>>({
      name:               'settings',
      clearInvalidConfig: false,
      configFileMode:     0o600,
    });
    const settings = new Settings(
      {
        read:  () => store.store,
        write: value => {
          store.store = value;
        },
      },
      credentials,
    );
    // Automated smoke applications use temporary profiles and never inspect real legacy secrets.
    await inheritSettings(settings, legacySources(smokeTest));
    startupPhase = 'window';
    registerSettings(
      settings,
      store.path,
      () => mainWindow,
      authorize,
      request => {
        if (request.action === 'dirty') {
          dirty = request.value;
          return;
        }
        if (request.choice === 'cancel') {
          quitting = false;
          unloadIntent = null;
          return;
        }
        dirty = false;
        if (quitting) app.quit();
        else if (unloadIntent === 'reload') {
          unloadIntent = null;
          mainWindow?.webContents.reload();
        } else mainWindow?.close();
      },
    );
    runtime = new RuntimeClient(resolve(__dirname, 'runtime.js'));
    runtime.onTaskChange(task => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(TASK_CHANGED_CHANNEL, task);
      }
    });
    ipcMain.handle(HEALTH_CHANNEL, async event => {
      await authorize(event);
      return runtime!.health();
    });
    ipcMain.handle(TASK_CHANNEL, async (event, request: unknown) => {
      await authorize(event);
      const parsed = z.discriminatedUnion('action', [
        z.strictObject({ action: z.literal('start'), taskType: z.string().min(1), params: z.record(z.string(), z.unknown()) }),
        z.strictObject({ action: z.literal('retry'), taskRunId: z.uuid() }),
        z.strictObject({ action: z.literal('control'), taskRunId: z.uuid(), kind: z.enum(['pause', 'resume', 'cancel']) }),
        z.strictObject({ action: z.literal('latestByTypes'), taskTypes: z.array(z.string().min(1)).min(1) }),
        z.strictObject({ action: z.literal('list') }),
        z.strictObject({ action: z.literal('get'), taskRunId: z.uuid() }),
      ]).parse(request);
      if (parsed.action === 'list') return runtime!.list(await settings.secret('database') ?? undefined);
      if (parsed.action === 'get') return runtime!.get(parsed.taskRunId, await settings.secret('database') ?? undefined);
      if (parsed.action === 'control' || parsed.action === 'latestByTypes') {
        const url = await settings.secret('database');
        if (!url) throw new Error('请先在设置中填写本地数据库连接。');
        return parsed.action === 'control'
          ? runtime!.control(parsed.taskRunId, parsed.kind, url)
          : runtime!.latestByTypes(parsed.taskTypes, url);
      }
      const url = await settings.secret('database');
      let taskType: string;
      let retryOfTaskRunId: string | null = null;
      if (parsed.action === 'start') {
        taskType = parsed.taskType;
      } else {
        if (!url) throw new Error('请先在设置中填写本地数据库连接。');
        const source = await runtime!.get(parsed.taskRunId, url);
        if (!source) throw new Error('任务不存在或已清除。');
        taskType = source.taskType;
        retryOfTaskRunId = parsed.taskRunId;
      }
      const label = taskType;
      const taskRunId = randomUUID();
      const createdAt = new Date().toISOString();
      const accepted: TaskView = {
        id:           taskRunId,
        taskType,
        label,
        status:       'pending',
        phase:        'accepted',
        elapsedMs:    0,
        stages:       [],
        result:       null,
        errorMessage: null,
        createdAt,
        startedAt:    null,
        finishedAt:   null,
      };
      // Reuse the existing unfinished run of this type instead of accepting a competing one.
      if (url) {
        const existing = await runtime!.findActiveByType(taskType, url);
        if (existing) {
          mainWindow?.webContents.send(TASK_CHANGED_CHANNEL, existing);
          return { taskRunId: existing.id, existing: true };
        }
      }
      mainWindow?.webContents.send(TASK_CHANGED_CHANNEL, accepted);
      const launchParams = parsed.action === 'start' ? parsed.params : null;
      const dispatch = (async () => {
        if (!url) throw new Error('请先在设置中填写本地数据库连接。');
        if (retryOfTaskRunId) return runtime!.retry(taskRunId, retryOfTaskRunId, url);
        if (launchParams !== null) return runtime!.start(taskRunId, taskType, launchParams, url);
        throw new Error('无法启动任务');
      })();
      void dispatch.then(result => {
        if (result.created) return;
        mainWindow?.webContents.send(TASK_CHANGED_CHANNEL, result.task);
        mainWindow?.webContents.send(TASK_CHANGED_CHANNEL, { ...accepted, status: 'discarded', phase: 'finished', finishedAt: new Date().toISOString() });
      }).catch(error => {
        const failed: TaskView = {
          ...accepted,
          status:       'failed',
          phase:        'finished',
          finishedAt:   new Date().toISOString(),
          errorMessage: error instanceof Error ? error.message : '无法启动任务',
        };
        mainWindow?.webContents.send(TASK_CHANGED_CHANNEL, failed);
      });
      return { taskRunId, existing: false };
    });
    openMainWindow();
    installSettingsMenu();
    app.on('activate', () => openMainWindow());
  })
  .catch(error => {
    // Keep diagnostics useful without logging settings or credential-bearing errors.
    console.error('[console startup]', startupPhase, error instanceof Error ? error.name : 'Error');
    const message
      = startupPhase === 'development'
        ? '开发服务未就绪或身份校验失败，请稍后重新打开。'
        : startupPhase === 'settings'
          ? '无法读取或保存设置，请检查配置文件及目录权限后重新打开。'
          : '无法打开管理端窗口，请重新打开。';
    dialog.showErrorBox('无法打开管理端', message);
    app.quit();
  });

app.on('before-quit', event => {
  if (!dirty) return;
  event.preventDefault();
  quitting = true;
  mainWindow?.webContents.send(CLOSE_REQUESTED);
});

// macOS keeps the application and local execution alive after closing its window.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => runtime?.stop());
