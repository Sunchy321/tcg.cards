import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem, net, protocol, shell } from 'electron';
import Store from 'electron-store';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
  API_CANCEL_CHANNEL,
  API_CHANNEL,
  API_STREAM_CHANNEL,
  HEALTH_CHANNEL,
  OPEN_SETTINGS,
  CLOSE_REQUESTED,
  EXTERNAL_OPEN_CHANNEL,
  TASK_CHANNEL,
  TASK_CHANGED_CHANNEL,
} from './contract';
import type { AdmissionGame, DesktopApiStreamEvent, TaskView } from './contract';
import { RuntimeClient } from './runtime-client';
import { Settings } from './settings';
import { credentials } from './credentials';
import { inheritSettings } from './legacy-settings';
import { legacySources } from './legacy-sources';
import { registerSettings } from './settings-ipc';
import { registerFileDialogs } from './file-dialog-ipc';
import { registerAuth } from './auth';
import { admitPublish, PUBLISH_GAME_LABELS } from './publish-admission';
import { verifyDevelopment } from './development-trust';
import type { IpcMainInvokeEvent, MessageBoxOptions } from 'electron';
import type { PathOverrides, RuntimeOverrides } from './runtime/runtime-config';

protocol.registerSchemesAsPrivileged([
  { scheme: 'tcg-console', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let dirty = false;
let quitting = false;
let unloadIntent: 'close' | 'reload' | null = null;
/** Set while unfinished tasks are being wound down for a confirmed quit. */
let taskShutdown: Promise<void> | null = null;
let taskQuitPrompt = false;
let mainWindow: BrowserWindow | null = null;
let runtime: RuntimeClient | null = null;
let syncedRuntimeSettingsRevision = -1;
const activeApiRequests = new Map<string, { senderId: number, runtimeRequestId: number }>();
const developmentUrl = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL || undefined : undefined;
const rendererUrl = developmentUrl ?? 'tcg-console://app/index.html';
const rendererOrigin = new URL(rendererUrl).origin;
const smokeTest = process.argv.includes('--smoke-test');
/** Restricts navigation and privileged IPC to the app's own renderer document. */
function isAppUrl(value: string) {
  const url = new URL(value);
  return developmentUrl ? url.origin === rendererOrigin : url.protocol === 'tcg-console:' && url.hostname === 'app';
}

/** Admits only local service routes required by the console runtime. */
function isLocalApiPath(path: string) {
  return path.startsWith('/rpc/')
    || path.startsWith('/images/')
    || path.startsWith('/ai/')
    || path === '/render/stream'
    || path === '/magic/banlist-report';
}

/** Creates or focuses the existing management window without requiring a session. */
function openMainWindow(settings = false) {
  // A closing window is destroyed before its closed handler clears the reference.
  if (mainWindow && !mainWindow.isDestroyed()) {
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
    // A restored replacement may already own the reference when this fires late.
    if (mainWindow === window) mainWindow = null;
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

/** Confirms one publish target and scope before remote admission or task creation. */
async function confirmPublish(game: AdmissionGame, environment: string, scope: string): Promise<boolean> {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const options: MessageBoxOptions = {
    type:      'warning',
    title:     '确认发布',
    message:   `将发布${PUBLISH_GAME_LABELS[game]}数据到“${environment}”。`,
    detail:    `发布范围：${scope}`,
    buttons:   ['取消', '确认发布'],
    defaultId: 0,
    cancelId:  0,
  };
  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  return result.response === 1;
}

/** Prevents renderer-supplied operator IDs from entering persisted task parameters. */
function taskParamsWithOperator(params: Record<string, unknown>, operatorUserId?: string): Record<string, unknown> {
  const value = { ...params };
  Reflect.deleteProperty(value, 'operatorUserId');
  if (operatorUserId) value.operatorUserId = operatorUserId;
  return value;
}

/** Converts configured dotted paths into the nested shape consumed by the runtime. */
function nestPaths(paths: Partial<Record<string, string>>): PathOverrides {
  const root: PathOverrides = {};
  for (const [key, value] of Object.entries(paths)) {
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    const parts = key.split('.');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const child = node[part];
      if (child == null || typeof child === 'string') node[part] = {};
      node = node[part] as PathOverrides;
    }
    node[parts.at(-1)!] = value;
  }
  return root;
}

/** Builds the isolated runtime snapshot without exposing decrypted values to the renderer. */
async function buildRuntimeSettings(settings: Settings): Promise<RuntimeOverrides> {
  const { config } = settings.snapshot();
  const [localDatabaseUrl, aiApiKey, hearthstonePublishTargets, magicPublishTargets] = await Promise.all([
    settings.secret('database'),
    settings.secret('ai'),
    Promise.all(config.publish.filter(item => item.publishTarget === 'hearthstone').map(async item => ({
      publishTarget:     item.publishTarget,
      environment:       item.environment,
      targetFingerprint: item.targetFingerprint ?? null,
      connectionString:  await settings.secret(`publish:${item.credentialKey}`),
    }))),
    Promise.all(config.publish.filter(item => item.publishTarget === 'magic').map(async item => ({
      publishTarget:     item.publishTarget,
      environment:       item.environment,
      targetFingerprint: item.targetFingerprint ?? null,
      connectionString:  await settings.secret(`publish:${item.credentialKey}`),
    }))),
  ]);
  const image = config.games.hearthstone?.image;

  return {
    localDatabaseUrl,
    paths:            nestPaths(config.paths),
    hearthstoneImage: {
      rendererBaseUrl: image?.rendererBaseUrl ?? null,
      bucketDir:       image?.bucketDir ?? null,
    },
    hearthstonePublishTargets,
    magicPublishTargets,
    aiConfig: {
      apiKey:  aiApiKey,
      baseUrl: config.ai.baseUrl ?? null,
      model:   config.ai.model ?? null,
    },
    editorIdentity: null,
  };
}

/** Applies a new settings revision to the service process before its next operation. */
async function syncRuntimeSettings(settings: Settings): Promise<void> {
  const revision = settings.snapshot().revision;
  if (revision === syncedRuntimeSettingsRevision) return;
  await runtime!.configure(await buildRuntimeSettings(settings));
  syncedRuntimeSettingsRevision = revision;
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
    registerFileDialogs(() => mainWindow, authorize);
    registerAuth(settings, authorize);
    runtime = new RuntimeClient(resolve(__dirname, 'runtime.js'), () => {
      syncedRuntimeSettingsRevision = -1;
      if (taskShutdown) return;
      // Reopening the configured database reruns the recovery scan so crashed runs stop looking alive.
      void syncRuntimeSettings(settings)
        .then(() => settings.secret('database'))
        .then(url => (url ? runtime?.list(url) : undefined))
        .catch(() => {});
    });
    runtime.onTaskChange(task => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(TASK_CHANGED_CHANNEL, task);
      }
    });
    ipcMain.handle(HEALTH_CHANNEL, async event => {
      await authorize(event);
      return runtime!.health();
    });
    ipcMain.handle(EXTERNAL_OPEN_CHANNEL, async (event, input: unknown) => {
      await authorize(event);
      const value = z.string().url().parse(input);
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持打开网页链接。');
      await shell.openExternal(url.href);
    });
    const apiRequestSchema = z.strictObject({
      requestId: z.uuid(),
      path:      z.string().startsWith('/'),
      method:    z.enum(['GET', 'POST', 'HEAD']),
      headers:   z.array(z.tuple([z.string(), z.string()])).max(64),
      body:      z.instanceof(Uint8Array).nullable(),
    });
    ipcMain.handle(API_CHANNEL, async (event, request: unknown) => {
      await authorize(event);
      const parsed = apiRequestSchema.parse(request);
      const url = new URL(parsed.path, 'http://desktop.local');
      if (url.origin !== 'http://desktop.local' || !isLocalApiPath(url.pathname)) {
        throw new Error('不支持的本地数据操作。');
      }
      await syncRuntimeSettings(settings);
      const requestKey = `${event.sender.id}:${parsed.requestId}`;
      const { id, response } = runtime!.requestApi({
        path:    `${url.pathname}${url.search}`,
        method:  parsed.method,
        headers: parsed.headers,
        body:    parsed.body,
      }, (stream: { event: 'api:chunk' | 'api:end', id: number, chunk?: Uint8Array, error?: string }) => {
        const value: DesktopApiStreamEvent = {
          requestId: parsed.requestId,
          kind:      stream.event === 'api:chunk' ? 'chunk' : 'end',
          chunk:     stream.chunk,
          error:     stream.error,
        };
        if (!event.sender.isDestroyed()) event.sender.send(API_STREAM_CHANNEL, value);
        if (stream.event === 'api:end') activeApiRequests.delete(requestKey);
      });
      activeApiRequests.set(requestKey, { senderId: event.sender.id, runtimeRequestId: id });
      try {
        return await response;
      } catch (error) {
        activeApiRequests.delete(requestKey);
        runtime!.cancelApiRequest(id);
        throw error;
      }
    });
    ipcMain.on(API_CANCEL_CHANNEL, (event, requestId: unknown) => {
      const parsed = z.uuid().safeParse(requestId);
      if (!parsed.success) return;
      void authorize(event).then(() => {
        const requestKey = `${event.sender.id}:${parsed.data}`;
        const active = activeApiRequests.get(requestKey);
        if (active) runtime?.cancelApiRequest(active.runtimeRequestId);
      }).catch(() => {});
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
      await syncRuntimeSettings(settings);
      if ((parsed.action === 'start' || parsed.action === 'retry') && taskShutdown) {
        throw new Error('应用正在退出，不能启动新任务。');
      }
      if (parsed.action === 'list') return runtime!.list(await settings.secret('database') ?? undefined);
      if (parsed.action === 'get') return runtime!.get(parsed.taskRunId, await settings.secret('database') ?? undefined);
      if (parsed.action === 'control' || parsed.action === 'latestByTypes') {
        const url = await settings.secret('database');
        if (!url) throw new Error('请先在设置中填写本地数据库连接。');
        if (parsed.action === 'control' && parsed.kind === 'resume') {
          // Continuing a publish run relaunches its Worker, so it passes the same admission.
          const source = await runtime!.get(parsed.taskRunId, url);
          const resumed = source ? await runtime!.describe(source.taskType) : null;
          if (resumed?.admission) await admitPublish(settings, resumed.admission.game);
        }
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
      if (!url) throw new Error('请先在设置中填写本地数据库连接。');
      const existing = await runtime!.findActiveByType(taskType, url);
      if (existing) {
        const existingDescription = await runtime!.describe(taskType);
        if (existingDescription?.admission) await admitPublish(settings, existingDescription.admission.game);
        mainWindow?.webContents.send(TASK_CHANGED_CHANNEL, existing);
        return { taskRunId: existing.id, existing: true };
      }
      const description = parsed.action === 'start'
        ? await runtime!.describe(taskType, parsed.params)
        : await runtime!.describeRetry(parsed.taskRunId, url);
      if (description?.publishConfirmation) {
        if (!description.admission) throw new Error('发布任务缺少权限检查。');
        const { environment, scope } = description.publishConfirmation;
        if (!environment.trim() || !scope.trim()) throw new Error('无法确认发布目标和范围。');
        if (!(await confirmPublish(description.admission.game, environment, scope))) return null;
      }
      // Publish tasks pass fail-closed remote admission before anything is started or reused.
      const operatorUserId = description?.admission
        ? await admitPublish(settings, description.admission.game)
        : undefined;
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
      mainWindow?.webContents.send(TASK_CHANGED_CHANNEL, accepted);
      const launchParams = parsed.action === 'start'
        ? taskParamsWithOperator(parsed.params, operatorUserId)
        : null;
      const dispatch = (async () => {
        if (!url) throw new Error('请先在设置中填写本地数据库连接。');
        if (retryOfTaskRunId) return runtime!.retry(taskRunId, retryOfTaskRunId, url, operatorUserId);
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

/** Confirms a quit that would interrupt unfinished tasks, then winds them down before quitting. */
async function confirmQuitWithTasks(): Promise<void> {
  if (!runtime) return;
  let unfinished = 0;
  try {
    unfinished = (await runtime.list()).length;
  } catch { /* Without the host there is nothing to wind down; the next boot classifies runs. */ }
  if (unfinished > 0) {
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const options: MessageBoxOptions = {
      type:      'warning',
      title:     '退出管理台',
      message:   `有 ${unfinished} 个任务尚未结束，确定要退出吗？`,
      detail:    '退出时会保存可用进度；可恢复的任务下次打开时等待手动继续。',
      buttons:   ['取消', '退出'],
      defaultId: 0,
      cancelId:  0,
    };
    // Canceling leaves every task running exactly as it was.
    if ((parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)).response !== 1) return;
  }
  taskShutdown = runtime.shutdown().then(() => {}, () => {});
  await taskShutdown;
  app.quit();
}

app.on('before-quit', event => {
  if (dirty) {
    event.preventDefault();
    quitting = true;
    mainWindow?.webContents.send(CLOSE_REQUESTED);
    return;
  }
  // Tasks are already wound down; let this quit through.
  if (taskShutdown) return;
  event.preventDefault();
  if (taskQuitPrompt) return;
  taskQuitPrompt = true;
  void confirmQuitWithTasks().finally(() => {
    taskQuitPrompt = false;
  });
});

// macOS keeps the application and local execution alive after closing its window.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => runtime?.stop());
