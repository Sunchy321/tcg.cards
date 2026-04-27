import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

const appURL = 'index.html';

function toErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Failed to create window';
}

async function waitForWindow(window: WebviewWindow) {
  await new Promise<void>((resolve, reject) => {
    void window.once('tauri://created', () => {
      resolve();
    });

    void window.once('tauri://error', event => {
      reject(new Error(toErrorMessage(event.payload)));
    });
  });
}

async function activateWindow(window: WebviewWindow, options?: { maximize?: boolean }) {
  await window.show();
  await window.unminimize();

  if (options?.maximize) {
    await window.maximize();
  }

  await window.setFocus();
}

export async function ensureMainWindow() {
  const existing = await WebviewWindow.getByLabel('main');

  if (existing) {
    await activateWindow(existing, { maximize: true });
    return existing;
  }

  const window = new WebviewWindow('main', {
    url:       appURL,
    title:     'TCG Cards Console',
    maximized: true,
    focus:     true,
  });

  await waitForWindow(window);
  return window;
}

export async function ensureLoginWindow() {
  const existing = await WebviewWindow.getByLabel('login');

  if (existing) {
    await activateWindow(existing);
    return existing;
  }

  await invoke('create_login_window');

  // Window was built by Rust from tauri.conf.json — retrieve the handle
  const window = (await WebviewWindow.getByLabel('login'))!;
  return window;
}
