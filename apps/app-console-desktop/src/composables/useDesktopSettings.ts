import { invoke } from '@tauri-apps/api/core';

/** Resolved database settings returned by the desktop runtime. */
export interface DesktopDatabaseSettings {
  externalConnectionString: string | null;
}

/** Connection test result returned by the desktop runtime. */
export interface DesktopDatabaseConnectionTestResult {
  databaseName: string;
  userName:     string;
  latencyMs:    number;
}

export type DesktopSettingsGame = 'hearthstone' | 'magic';
export type DesktopGameRepoKey = 'hsdata';

/** Database settings loaded from the desktop runtime. */
export function getDesktopDatabaseSettings() {
  return invoke<DesktopDatabaseSettings>('desktop_get_database_settings');
}

/** Database settings persisted in the desktop runtime. */
export function setDesktopDatabaseSettings(
  externalConnectionString: string | null,
) {
  return invoke<DesktopDatabaseSettings>('desktop_set_database_settings', {
    externalConnectionString,
  });
}

/** Database connection tested by the desktop runtime. */
export function testDesktopDatabaseConnection(
  externalConnectionString: string | null,
) {
  return invoke<DesktopDatabaseConnectionTestResult>('desktop_test_database_connection', {
    externalConnectionString,
  });
}

export function getDesktopGameRepo(game: DesktopSettingsGame, repoKey: DesktopGameRepoKey) {
  return invoke<string | null>('desktop_get_game_repo', { game, repoKey });
}

export function setDesktopGameRepo(
  game: DesktopSettingsGame,
  repoKey: DesktopGameRepoKey,
  repoPath: string | null,
) {
  return invoke<string | null>('desktop_set_game_repo', { game, repoKey, repoPath });
}

export function pickDesktopDirectory(directory: string | null) {
  return invoke<string | null>('desktop_pick_directory', { directory });
}
