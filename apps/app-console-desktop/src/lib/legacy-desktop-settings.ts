/** Read-only compatibility surface for the migrated Hearthstone screens. */
import type { SettingsSnapshot } from '../../shared/settings';

export interface DesktopPublishTarget {
  publishTarget:     string;
  environment:       string;
  targetFingerprint: string | null;
  credentialKey:     string | null;
  connectionString?: never;
}

export interface DesktopHearthstoneImageSettings {
  rendererBaseUrl: string | null;
  bucketDir:       string | null;
}

async function readSettings(): Promise<SettingsSnapshot> {
  return window.desktop.settings.read();
}

export async function getDesktopPath(key: string): Promise<string | null> {
  const snapshot = await readSettings();
  return snapshot.config.paths[key as keyof typeof snapshot.config.paths] ?? null;
}

export async function setDesktopPath(key: string, path: string | null): Promise<string | null> {
  const snapshot = await window.desktop.settings.update(`paths.${key}`, path);
  return snapshot.config.paths[key as keyof typeof snapshot.config.paths] ?? null;
}

export async function getDesktopHearthstoneImageSettings(): Promise<DesktopHearthstoneImageSettings> {
  const snapshot = await readSettings();
  const image = snapshot.config.games.hearthstone?.image;
  return { rendererBaseUrl: image?.rendererBaseUrl ?? null, bucketDir: image?.bucketDir ?? null };
}

/** Returns only public target metadata and never reads a decrypted connection string. */
export async function getDesktopPublishTargets(): Promise<DesktopPublishTarget[]> {
  const snapshot = await readSettings();
  return snapshot.config.publish
    .filter(target => snapshot.credentials[`publish:${target.credentialKey}`] === true)
    .map(target => ({
      publishTarget:     target.publishTarget,
      environment:       target.environment,
      targetFingerprint: target.targetFingerprint ?? null,
      credentialKey:     target.credentialKey,
    }));
}
