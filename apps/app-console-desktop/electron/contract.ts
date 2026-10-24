import type { SettingsSnapshot } from '../shared/settings';

/** Health information returned by the isolated local business process. */
export interface RuntimeHealth {
  runtime: 'node';
  pid: number;
  version: string;
}

/** Restricted native capabilities available to the desktop renderer. */
export interface DesktopBridge {
  settings: {
    read(): Promise<SettingsSnapshot>;
    update(key: string, value: unknown): Promise<SettingsSnapshot>;
    saveJson(text: string, revision: number): Promise<SettingsSnapshot>;
    setSecret(key: string, value: string | null): Promise<SettingsSnapshot>;
    pickDirectory(current: string | null): Promise<string | null>;
    openDirectory(): Promise<void>;
    paths(game: 'magic' | 'hearthstone'): Promise<GamePaths>;
    setDirty(value: boolean): Promise<void>;
    resolveClose(choice: 'save' | 'discard' | 'cancel'): Promise<void>;
    onCloseRequested(listener: () => void): () => void;
  };
  runtime: {
    health(): Promise<RuntimeHealth>;
  };
}

/** Request sent only between the main and local business processes. */
export interface RuntimeRequest {
  id: number;
  method: 'health';
}

/** Response sent only between the local business and main processes. */
export interface RuntimeResponse {
  id: number;
  result: RuntimeHealth;
}

export const HEALTH_CHANNEL = 'desktop:runtime:health';

/** Settings requests admitted by the main-process gateway. */
export type SettingsRequest =
  | { action: 'read' }
  | { action: 'update'; key: string; value: unknown }
  | { action: 'json'; text: string; revision: number }
  | { action: 'secret'; key: string; value: string | null }
  | { action: 'directory'; current: string | null }
  | { action: 'openDirectory' }
  | { action: 'paths'; game: 'magic' | 'hearthstone' };
/** Close decisions are sent only after unsaved JSON has been dealt with. */
export type CloseRequest = { action: 'dirty'; value: boolean } | { action: 'resolve'; choice: 'save' | 'discard' | 'cancel' };
/** Derived directories for one game, never persisted merely by reading them. */
export type GamePaths = Record<'data' | 'image', { root: string | null; leaves: { key: string; label: string; path: string | null }[] }>;

export const SETTINGS_CHANNEL = 'desktop:settings';
export const CLOSE_CHANNEL = 'desktop:settings:close';
export const CLOSE_REQUESTED = 'desktop:settings:close-requested';
