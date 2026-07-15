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

/** Publish target settings returned by the desktop runtime. */
export interface DesktopPublishTargetSettings {
  publishTarget:     string | null;
  environment:       string | null;
  targetFingerprint: string | null;
  connectionString:  string | null;
}

/** Publish target row returned by the desktop runtime. */
export interface DesktopPublishTarget {
  publishTarget:     string;
  environment:       string;
  targetFingerprint: string;
  credentialKey:     string | null;
  connectionString:  string | null;
}

/** Hearthstone image settings returned by the desktop runtime. */
export interface DesktopHearthstoneImageSettings {
  rendererBaseUrl: string | null;
  bucketDir:       string | null;
}

/** Publish target test result returned by the desktop runtime. */
export interface DesktopPublishTargetTestResult {
  publishTarget:     string;
  environment:       string;
  targetFingerprint: string;
  databaseName:      string;
  userName:          string;
  serverHost:        string;
  serverPort:        number;
  latencyMs:         number;
}

/** Publish target binding validation result returned by the desktop runtime. */
export interface DesktopPublishTargetValidationResult {
  isValid:                  boolean;
  reasons:                  string[];
  currentPublishTarget:     string | null;
  currentEnvironment:       string | null;
  currentTargetFingerprint: string | null;
}

/** Desktop config file location metadata returned by the desktop runtime. */
export interface DesktopConfigFileInfo {
  configFilePath:      string;
  configDirectoryPath: string;
  exists:              boolean;
}

/** Raw desktop config payload returned by the desktop runtime. */
export interface DesktopRawConfig {
  text: string;
  file: DesktopConfigFileInfo;
}

export type DesktopSettingsGame = 'hearthstone' | 'magic';
export type DesktopGameRepoKey = 'hsdata';

/** Raw desktop config loaded from the desktop runtime. */
export function getDesktopRawConfig() {
  return invoke<DesktopRawConfig>('desktop_get_raw_config');
}

/** Raw desktop config persisted in the desktop runtime. */
export function setDesktopRawConfig(jsonText: string) {
  return invoke<DesktopRawConfig>('desktop_set_raw_config', {
    jsonText,
  });
}

/** Desktop config file location loaded from the desktop runtime. */
export function getDesktopConfigFileInfo() {
  return invoke<DesktopConfigFileInfo>('desktop_get_config_file_info');
}

/** Desktop config directory opened by the desktop runtime. */
export function openDesktopConfigDirectory() {
  return invoke<void>('desktop_open_config_directory');
}

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

/** Publish target settings loaded from the desktop runtime. */
export function getDesktopPublishTarget() {
  return invoke<DesktopPublishTargetSettings>('desktop_get_publish_target');
}

/** Publish target list loaded from the desktop runtime. */
export function getDesktopPublishTargets() {
  return invoke<DesktopPublishTarget[]>('desktop_get_publish_targets');
}

/** Hearthstone image settings loaded from the desktop runtime. */
export function getDesktopHearthstoneImageSettings() {
  return invoke<DesktopHearthstoneImageSettings>('desktop_get_hearthstone_image_settings');
}

/** Hearthstone image settings persisted in the desktop runtime. */
export function setDesktopHearthstoneImageSettings(
  rendererBaseUrl: string | null,
  bucketDir: string | null,
) {
  return invoke<DesktopHearthstoneImageSettings>('desktop_set_hearthstone_image_settings', {
    rendererBaseUrl,
    bucketDir,
  });
}

/** Publish target settings persisted in the desktop runtime. */
export function setDesktopPublishTarget(
  publishTarget: string | null,
  environment: string | null,
  connectionString: string | null,
) {
  return invoke<DesktopPublishTargetSettings>('desktop_set_publish_target', {
    publishTarget,
    environment,
    connectionString,
  });
}

/** Publish target list persisted in the desktop runtime. */
export function setDesktopPublishTargets(
  targets: DesktopPublishTarget[],
) {
  return invoke<DesktopPublishTarget[]>('desktop_set_publish_targets', {
    targets,
  });
}

/** Publish target connection tested by the desktop runtime. */
export function testDesktopPublishTarget(
  publishTarget: string | null,
  environment: string | null,
  connectionString: string | null,
) {
  return invoke<DesktopPublishTargetTestResult>('desktop_test_publish_target', {
    publishTarget,
    environment,
    connectionString,
  });
}

/** Expected publish target binding validated by the desktop runtime. */
export function validateDesktopPublishTargetBinding(
  publishTarget: string,
  environment: string,
  targetFingerprint: string,
) {
  return invoke<DesktopPublishTargetValidationResult>(
    'desktop_validate_publish_target_binding',
    {
      publishTarget,
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

/** AI config returned by the desktop runtime. */
export interface DesktopAiConfig {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
}

/** AI config loaded from the desktop runtime. */
export function getDesktopAiConfig() {
  return invoke<DesktopAiConfig>('desktop_get_ai_config');
}

/** AI config persisted in the desktop runtime. */
export function setDesktopAiConfig(
  apiKey: string | null,
  baseUrl: string | null,
  model: string | null,
) {
  return invoke<DesktopAiConfig>('desktop_set_ai_config', {
    apiKey,
    baseUrl,
    model,
  });
}

/** Native directory picker opened by the desktop runtime. */
export function pickDesktopDirectory(directory: string | null) {
  return invoke<string | null>('desktop_pick_directory', { directory });
}
