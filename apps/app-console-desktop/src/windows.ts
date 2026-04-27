import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const appURL = "index.html";

function toErrorMessage(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to create window";
}

async function waitForWindow(window: WebviewWindow) {
  await new Promise<void>((resolve, reject) => {
    void window.once("tauri://created", () => {
      resolve();
    });

    void window.once("tauri://error", (event) => {
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
  const existing = await WebviewWindow.getByLabel("main");

  if (existing) {
    await activateWindow(existing, { maximize: true });
    return existing;
  }

  const window = new WebviewWindow("main", {
    url: appURL,
    title: "TCG Cards Console",
    maximized: true,
    focus: true,
  });

  await waitForWindow(window);
  return window;
}

export async function ensureLoginWindow() {
  const existing = await WebviewWindow.getByLabel("login");

  if (existing) {
    await activateWindow(existing);
    return existing;
  }

  const window = new WebviewWindow("login", {
    url: appURL,
    title: "Sign In - TCG Cards Console",
    width: 460,
    height: 640,
    minWidth: 420,
    minHeight: 560,
    center: true,
    focus: true,
  });

  await waitForWindow(window);
  return window;
}
