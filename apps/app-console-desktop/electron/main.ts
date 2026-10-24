import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron';
import Store from 'electron-store';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { HEALTH_CHANNEL, CLOSE_REQUESTED } from './contract';
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
  return developmentUrl
    ? url.origin === rendererOrigin
    : url.protocol === 'tcg-console:' && url.hostname === 'app';
}

/** Creates or focuses the existing management window without requiring a session. */
function openMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const window = new BrowserWindow({
    title: 'TCG Cards Console',
    show: false,
    webPreferences: {
      preload: resolve(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
  window.on('closed', () => { mainWindow = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  void window.loadURL(rendererUrl);
}

/** Rechecks the current main frame and development-server identity for privileged IPC. */
async function authorize(event: IpcMainInvokeEvent) {
  if (!mainWindow || event.sender !== mainWindow.webContents
    || event.senderFrame !== mainWindow.webContents.mainFrame
    || !isAppUrl(event.senderFrame.url)) throw new Error('无法授权此操作。');
  if (developmentUrl) await verifyDevelopment(developmentUrl, process.env.CONSOLE_DEV_IDENTITY);
}

let startupPhase = 'development';
app.whenReady().then(async () => {
  if (developmentUrl) await verifyDevelopment(developmentUrl, process.env.CONSOLE_DEV_IDENTITY, 15_000);
  startupPhase = 'settings';
  const publicDir = resolve(app.getAppPath(), '.output/public');
  protocol.handle('tcg-console', (request) => {
    const url = new URL(request.url);
    const path = resolve(publicDir, `.${decodeURIComponent(url.pathname)}`);
    if (url.hostname !== 'app' || !path.startsWith(`${publicDir}${sep}`)) {
      return new Response(null, { status: 403 });
    }
    return net.fetch(pathToFileURL(path).href);
  });
  const store = new Store<Record<string, unknown>>({ name: 'settings', clearInvalidConfig: false, configFileMode: 0o600 });
  const settings = new Settings({ read: () => store.store, write: value => { store.store = value; } }, credentials);
  // Automated smoke applications use temporary profiles and never inspect real legacy secrets.
  await inheritSettings(settings, legacySources(smokeTest));
  startupPhase = 'window';
  registerSettings(settings, store.path, () => mainWindow, authorize, request => {
    if (request.action === 'dirty') { dirty = request.value; return; }
    if (request.choice === 'cancel') { quitting = false; unloadIntent = null; return; }
    dirty = false;
    if (quitting) app.quit();
    else if (unloadIntent === 'reload') { unloadIntent = null; mainWindow?.webContents.reload(); }
    else mainWindow?.close();
  });
  runtime = new RuntimeClient(resolve(__dirname, 'runtime.js'));
  ipcMain.handle(HEALTH_CHANNEL, async (event) => {
    await authorize(event);
    return runtime!.health();
  });
  openMainWindow();
  app.on('activate', openMainWindow);
}).catch(error => {
  // Keep diagnostics useful without logging settings or credential-bearing errors.
  console.error('[console startup]', startupPhase, error instanceof Error ? error.name : 'Error');
  const message = startupPhase === 'development'
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
