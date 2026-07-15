const localDatabaseUrlOverride = {
  current: null as string | null,
};

const hsdataRepoPathOverride = {
  current: null as string | null,
};

/** Image-settings override payload injected by the desktop shell. */
export interface HearthstoneImageOverride {
  rendererBaseUrl: string | null;
  bucketDir: string | null;
}

const hearthstoneImageOverride = {
  current: null as HearthstoneImageOverride | null,
};

/** Publish-target override payload injected by the desktop shell. */
export interface HearthstonePublishTargetOverride {
  publishTarget: string | null;
  environment: string | null;
  targetFingerprint: string | null;
  connectionString: string | null;
}

const hearthstonePublishTargetOverrides = {
  current: [] as HearthstonePublishTargetOverride[],
};

/** Stores one runtime-local database URL override provided by the desktop shell. */
export function setLocalDatabaseUrlOverride(value: string | null) {
  localDatabaseUrlOverride.current = value?.trim() || null;
}

/** Resolves the active local database URL from runtime override first, then environment fallback. */
export function readLocalDatabaseUrl() {
  return localDatabaseUrlOverride.current ?? (process.env.DESKTOP_LOCAL_DATABASE_URL?.trim() || null);
}

/** Reports whether the runtime currently has any usable local database URL configured. */
export function hasLocalDatabaseUrl() {
  return readLocalDatabaseUrl() != null;
}

/** Stores one runtime-local hsdata repository path override provided by the desktop shell. */
export function setHsdataRepoPathOverride(value: string | null) {
  hsdataRepoPathOverride.current = value?.trim() || null;
}

/** Resolves the active hsdata repository path from the runtime override. */
export function readHsdataRepoPath() {
  return hsdataRepoPathOverride.current;
}

/** Reports whether the runtime currently has any usable hsdata repository path configured. */
export function hasHsdataRepoPath() {
  return readHsdataRepoPath() != null;
}

/** Stores one runtime-local Hearthstone image override provided by the desktop shell. */
export function setHearthstoneImageOverride(value: HearthstoneImageOverride | null) {
  if (value == null) {
    hearthstoneImageOverride.current = null;
    return;
  }

  hearthstoneImageOverride.current = {
    rendererBaseUrl: value.rendererBaseUrl?.trim() ?? null,
    bucketDir: value.bucketDir?.trim() ?? null,
  };
}

/** Resolves the active Hearthstone image override from runtime memory. */
export function readHearthstoneImageOverride() {
  return hearthstoneImageOverride.current;
}

/** Reports whether the runtime currently has any usable Hearthstone image override configured. */
export function hasHearthstoneImageOverride() {
  const image = readHearthstoneImageOverride();
  return image?.rendererBaseUrl != null || image?.bucketDir != null;
}

/** Stores one runtime-local Hearthstone publish target override provided by the desktop shell. */
export function setHearthstonePublishTargetOverride(value: HearthstonePublishTargetOverride | null) {
  setHearthstonePublishTargetOverrides(value == null ? [] : [value]);
}

/** Stores runtime-local Hearthstone publish target overrides provided by the desktop shell. */
export function setHearthstonePublishTargetOverrides(value: HearthstonePublishTargetOverride[]) {
  hearthstonePublishTargetOverrides.current = value.map(item => ({
    publishTarget: item.publishTarget?.trim() ?? null,
    environment: item.environment?.trim() ?? null,
    targetFingerprint: item.targetFingerprint?.trim() ?? null,
    connectionString: item.connectionString?.trim() ?? null,
  }));
}

/** Resolves runtime-local Hearthstone publish target overrides from runtime memory. */
export function readHearthstonePublishTargetOverrides() {
  return hearthstonePublishTargetOverrides.current;
}

/** Resolves the primary Hearthstone publish target override from runtime memory. */
export function readHearthstonePublishTargetOverride() {
  return hearthstonePublishTargetOverrides.current[0] ?? null;
}

/** Reports whether the runtime currently has any complete Hearthstone publish target override. */
export function hasHearthstonePublishTargetOverride() {
  return readHearthstonePublishTargetOverrides().some(target => {
    return target.publishTarget != null
      && target.environment != null
      && target.targetFingerprint != null
      && target.connectionString != null;
  });
}

export interface AiConfig {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
}

const aiConfigOverride = {
  current: null as AiConfig | null,
};

/** Stores one runtime-local AI config override provided by the desktop shell. */
export function setAiConfig(value: AiConfig | null) {
  aiConfigOverride.current = value;
}

/** Resolves the active AI config from runtime override. */
export function readAiConfig(): AiConfig {
  return aiConfigOverride.current ?? { apiKey: null, baseUrl: null, model: null };
}

/** Reports whether the runtime currently has usable AI config. */
export function hasAiConfig() {
  const config = readAiConfig();
  return config.apiKey != null;
}

const editorIdentityOverride = {
  current: null as string | null,
};

/** Stores one runtime-local editor identity override provided by the desktop shell. */
export function setEditorIdentity(value: string | null) {
  editorIdentityOverride.current = value?.trim() || null;
}

/** Resolves the active editor identity from runtime override. Returns 'unknown' if not configured. */
export function readEditorIdentity() {
  return editorIdentityOverride.current || 'unknown';
}
