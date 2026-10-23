import { app, BrowserWindow, ipcMain, net, protocol } from 'electron';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { HEALTH_CHANNEL } from './contract';
import { RuntimeClient } from './runtime-client';

protocol.registerSchemesAsPrivileged([
  { scheme: 'tcg-console', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow | null = null;
let runtime: RuntimeClient | null = null;
const developmentUrl = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;
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
  if (!smokeTest) {
    window.maximize();
    window.once('ready-to-show', () => window.show());
  }
  window.on('closed', () => { mainWindow = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  void window.loadURL(rendererUrl);
}

app.whenReady().then(() => {
  const publicDir = resolve(app.getAppPath(), '.output/public');
  protocol.handle('tcg-console', (request) => {
    const url = new URL(request.url);
    const path = resolve(publicDir, `.${decodeURIComponent(url.pathname)}`);
    if (url.hostname !== 'app' || !path.startsWith(`${publicDir}${sep}`)) {
      return new Response(null, { status: 403 });
    }
    return net.fetch(pathToFileURL(path).href);
  });
  runtime = new RuntimeClient(resolve(__dirname, 'runtime.js'));
  ipcMain.handle(HEALTH_CHANNEL, (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents
      || event.senderFrame !== mainWindow.webContents.mainFrame
      || !isAppUrl(event.senderFrame.url)) {
      throw new Error('Untrusted desktop caller');
    }
    return runtime!.health();
  });
  openMainWindow();
  app.on('activate', openMainWindow);
});

// macOS keeps the application and local execution alive after closing its window.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => runtime?.stop());
