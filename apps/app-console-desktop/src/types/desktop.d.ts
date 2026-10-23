import type { DesktopBridge } from '../../electron/contract';

declare global {
  /** Native bridge exposed only inside the Electron management window. */
  interface Window {
    desktop?: DesktopBridge;
  }
}

export {};
