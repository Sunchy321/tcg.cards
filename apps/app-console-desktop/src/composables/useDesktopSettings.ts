import type { SettingsSnapshot } from '../../shared/settings';

export {
  getDesktopHearthstoneImageSettings,
  getDesktopPath,
  getDesktopPublishTargets,
  setDesktopPath,
} from '~/lib/legacy-desktop-settings';
export type {
  DesktopHearthstoneImageSettings,
  DesktopPublishTarget,
} from '~/lib/legacy-desktop-settings';

/** Removes Electron transport wording while keeping the main process's sanitized error. */
export function settingsError(error: unknown) {
  const text
    = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
  const message = text.includes('Error: ') ? text.slice(text.lastIndexOf('Error: ') + 7) : text;
  return /^[\u3400-\u9fff]/.test(message) ? message : '操作失败，请检查设置后重试。';
}

/** Shares persisted settings across pages without sharing mutable drafts with the store. */
export function useDesktopSettings() {
  const snapshot = useState<SettingsSnapshot | null>('desktop-settings', () => null);
  const loading = useState('desktop-settings-loading', () => false);
  const error = useState('desktop-settings-error', () => '');
  const bridge = window.desktop.settings;
  /** Refreshes from the authoritative main process after navigation or inheritance. */
  async function load() {
    loading.value = true;
    error.value = '';
    try {
      snapshot.value = await bridge.read();
    } catch (cause) {
      error.value = settingsError(cause);
    } finally {
      loading.value = false;
    }
  }
  /** Applies a confirmed save response without discarding another page's editor text. */
  async function update(key: string, value: unknown) {
    snapshot.value = await bridge.update(key, value);
  }
  /** Saves secrets separately; only their configured status returns to the renderer. */
  async function secret(key: string, value: string | null) {
    snapshot.value = await bridge.setSecret(key, value);
  }
  return { snapshot, loading, error, load, update, secret, bridge };
}
