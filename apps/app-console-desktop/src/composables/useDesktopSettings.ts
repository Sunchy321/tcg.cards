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

/** Hearthstone publish target settings returned by the desktop runtime. */
export interface DesktopHearthstonePublishTargetSettings {
  publishTargetId:   string | null;
  environment:       string | null;
  targetFingerprint: string | null;
  connectionString:  string | null;
}

/** Hearthstone publish target test result returned by the desktop runtime. */
export interface DesktopHearthstonePublishTargetTestResult {
  publishTargetId:   string;
  environment:       string;
  targetFingerprint: string;
  databaseName:      string;
  userName:          string;
  serverHost:        string;
  serverPort:        number;
  latencyMs:         number;
}

/** Hearthstone publish target binding validation result returned by the desktop runtime. */
export interface DesktopHearthstonePublishTargetValidationResult {
  isValid:                  boolean;
  reasons:                  string[];
  currentPublishTargetId:   string | null;
  currentEnvironment:       string | null;
  currentTargetFingerprint: string | null;
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

/** Hearthstone publish target settings loaded from the desktop runtime. */
export function getDesktopHearthstonePublishTarget() {
  return invoke<DesktopHearthstonePublishTargetSettings>('desktop_get_hearthstone_publish_target');
}

/** Hearthstone publish target settings persisted in the desktop runtime. */
export function setDesktopHearthstonePublishTarget(
  publishTargetId: string | null,
  environment: string | null,
  connectionString: string | null,
) {
  return invoke<DesktopHearthstonePublishTargetSettings>('desktop_set_hearthstone_publish_target', {
    publishTargetId,
    environment,
    connectionString,
  });
}

/** Hearthstone publish target connection tested by the desktop runtime. */
export function testDesktopHearthstonePublishTarget(
  publishTargetId: string | null,
  environment: string | null,
  connectionString: string | null,
) {
  return invoke<DesktopHearthstonePublishTargetTestResult>('desktop_test_hearthstone_publish_target', {
    publishTargetId,
    environment,
    connectionString,
  });
}

/** Expected Hearthstone publish target binding validated by the desktop runtime. */
export function validateDesktopHearthstonePublishTargetBinding(
  publishTargetId: string,
  environment: string,
  targetFingerprint: string,
) {
  return invoke<DesktopHearthstonePublishTargetValidationResult>(
    'desktop_validate_hearthstone_publish_target_binding',
    {
      publishTargetId,
      environment,
      targetFingerprint,
    },
  );
}

/** Game repository path loaded from the desktop runtime. */
export function getDesktopGameRepo(game: DesktopSettingsGame, repoKey: DesktopGameRepoKey) {
  return invoke<string | null>('desktop_get_game_repo', { game, repoKey });
}

/** Game repository path persisted in the desktop runtime. */
export function setDesktopGameRepo(
  game: DesktopSettingsGame,
  repoKey: DesktopGameRepoKey,
  repoPath: string | null,
) {
  return invoke<string | null>('desktop_set_game_repo', { game, repoKey, repoPath });
}

/** Native directory picker opened by the desktop runtime. */
export function pickDesktopDirectory(directory: string | null) {
  return invoke<string | null>('desktop_pick_directory', { directory });
}
