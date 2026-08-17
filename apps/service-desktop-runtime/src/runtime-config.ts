const localDatabaseUrlOverride = {
  current: null as string | null,
};

const hsdataRepoPathOverride = {
  current: null as string | null,
};

/** Image-settings override payload injected by the desktop shell. */
export interface HearthstoneImageOverride {
  rendererBaseUrl: string | null;
  bucketDir:       string | null;
}

const hearthstoneImageOverride = {
  current: null as HearthstoneImageOverride | null,
};

/** Publish-target override payload injected by the desktop shell. */
export interface HearthstonePublishTargetOverride {
  publishTarget:     string | null;
  environment:       string | null;
  targetFingerprint: string | null;
  connectionString:  string | null;
}

const hearthstonePublishTargetOverrides = {
  current: [] as HearthstonePublishTargetOverride[],
};

/** Publish-target override payload injected for the Yu-Gi-Oh! desktop workflow. */
export interface YugiohPublishTargetOverride {
  publishTargetId: string | null;
  environment: string | null;
  targetFingerprint: string | null;
  connectionString: string | null;
}

const yugiohPublishTargetOverride = {
  current: null as YugiohPublishTargetOverride | null,
};

/** Local bucket override injected for the Yu-Gi-Oh! primary-image workflow. */
export interface YugiohImageOverride {
  bucketDir: string | null;
}

const yugiohImageOverride = {
  current: null as YugiohImageOverride | null,
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
    bucketDir:       value.bucketDir?.trim() ?? null,
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
    publishTarget:     item.publishTarget?.trim() ?? null,
    environment:       item.environment?.trim() ?? null,
    targetFingerprint: item.targetFingerprint?.trim() ?? null,
    connectionString:  item.connectionString?.trim() ?? null,
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
  apiKey:  string | null;
  baseUrl: string | null;
  model:   string | null;
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

export interface RuntimeOverrides {
  localDatabaseUrl:          string | null;
  hsdataRepoPath:            string | null;
  hearthstoneImage:          HearthstoneImageOverride | null;
  hearthstonePublishTargets: HearthstonePublishTargetOverride[];
  aiConfig:                  AiConfig | null;
  editorIdentity:            string | null;
}

/** Collects all current runtime overrides into a serializable object for Worker transfer. */
export function collectRuntimeOverrides(): RuntimeOverrides {
  return {
    localDatabaseUrl:          readLocalDatabaseUrl(),
    hsdataRepoPath:            readHsdataRepoPath(),
    hearthstoneImage:          readHearthstoneImageOverride(),
    hearthstonePublishTargets: readHearthstonePublishTargetOverrides(),
    aiConfig:                  readAiConfig(),
    editorIdentity:            readEditorIdentity(),
  };
}

/** Restores runtime overrides from a serialized object in the Worker context. */
export function applyRuntimeOverrides(data: RuntimeOverrides): void {
  setLocalDatabaseUrlOverride(data.localDatabaseUrl);
  setHsdataRepoPathOverride(data.hsdataRepoPath);
  setHearthstoneImageOverride(data.hearthstoneImage);
  setHearthstonePublishTargetOverrides(data.hearthstonePublishTargets);
  setAiConfig(data.aiConfig);
  setEditorIdentity(data.editorIdentity);
}

/** Stores one runtime-local Yu-Gi-Oh! publish target injected by the desktop shell. */
export function setYugiohPublishTargetOverride(value: YugiohPublishTargetOverride | null) {
  if (value == null) {
    yugiohPublishTargetOverride.current = null;
    return;
  }

  yugiohPublishTargetOverride.current = {
    publishTargetId: value.publishTargetId?.trim() ?? null,
    environment: value.environment?.trim() ?? null,
    targetFingerprint: value.targetFingerprint?.trim() ?? null,
    connectionString: value.connectionString?.trim() ?? null,
  };
}

/** Resolves the current runtime-local Yu-Gi-Oh! publish target override. */
export function readYugiohPublishTargetOverride() {
  return yugiohPublishTargetOverride.current;
}

/** Reports whether all Yu-Gi-Oh! publish target fields are currently configured. */
export function hasYugiohPublishTargetOverride() {
  const target = readYugiohPublishTargetOverride();

  return target?.publishTargetId != null
    && target.environment != null
    && target.targetFingerprint != null
    && target.connectionString != null;
}

/** Stores one runtime-local Yu-Gi-Oh! image bucket injected by desktop. */
export function setYugiohImageOverride(value: YugiohImageOverride | null) {
  yugiohImageOverride.current = value == null
    ? null
    : { bucketDir: value.bucketDir?.trim() ?? null };
}

/** Resolves the current runtime-local Yu-Gi-Oh! image bucket override. */
export function readYugiohImageOverride() {
  return yugiohImageOverride.current;
}

/** Reports whether a non-empty Yu-Gi-Oh! local image bucket is configured. */
export function hasYugiohImageOverride() {
  return readYugiohImageOverride()?.bucketDir != null;
}
