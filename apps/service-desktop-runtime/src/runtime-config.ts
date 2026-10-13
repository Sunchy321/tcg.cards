const localDatabaseUrlOverride = {
  current: null as string | null,
};

/** Generic data/image directory paths keyed by dotted `{game}.{ns}.{leaf}`. */
const pathOverrides = new Map<string, string>();

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
  publishTargetId:   string | null;
  environment:       string | null;
  targetFingerprint: string | null;
  connectionString:  string | null;
}

/** Publish-target override payload injected for the magic desktop workflow. */
export interface MagicPublishTargetOverride {
  publishTarget:     string | null;
  environment:       string | null;
  targetFingerprint: string | null;
  connectionString:  string | null;
}

const magicPublishTargetOverrides = {
  current: [] as MagicPublishTargetOverride[],
};

/** Stores runtime-local magic publish target overrides provided by the desktop shell. */
export function setMagicPublishTargetOverrides(value: MagicPublishTargetOverride[]) {
  magicPublishTargetOverrides.current = value;
}

/** Lists runtime-local magic publish target overrides. */
export function readMagicPublishTargetOverrides() {
  return magicPublishTargetOverrides.current;
}

/** Reports whether the runtime has any complete magic publish target override. */
export function hasMagicPublishTargetOverride() {
  return readMagicPublishTargetOverrides().some(target => {
    return target.publishTarget != null
      && target.environment != null
      && target.targetFingerprint != null
      && target.connectionString != null;
  });
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

/** Stores one runtime-local path override for a dotted `{game}.{ns}.{leaf}` key. */
export function setPathOverride(key: string, value: string | null) {
  const trimmed = value?.trim();
  if (trimmed) {
    pathOverrides.set(key, trimmed);
  } else {
    pathOverrides.delete(key);
  }
}

/** Reads one stored path override without resolving it from its parent. */
export function readPathOverride(key: string) {
  return pathOverrides.get(key) ?? null;
}

/** Reports whether a path override is stored for the given key. */
export function hasPathOverride(key: string) {
  return pathOverrides.has(key);
}

/** Nested `{game}.{ns}.{leaf}` path tree as carried by the desktop config sync. */
export interface PathOverrides {
  [key: string]: string | PathOverrides;
}

function flattenPaths(node: PathOverrides, prefix: string, out: Map<string, string>) {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) out.set(full, trimmed);
    } else {
      flattenPaths(value, full, out);
    }
  }
}

function nestPaths(flat: Record<string, string>): PathOverrides {
  const root: PathOverrides = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      node[part] = (node[part] as PathOverrides | undefined) ?? {};
      node = node[part] as PathOverrides;
    }
    node[parts[parts.length - 1]!] = value;
  }
  return root;
}

/** Replaces all path overrides with one nested snapshot (from the desktop config sync). */
export function applyPathOverrides(paths: PathOverrides) {
  pathOverrides.clear();
  flattenPaths(paths, '', pathOverrides);
}

/** Snapshot of all stored path overrides as a nested tree for worker transfer. */
export function readAllPathOverrides(): PathOverrides {
  return nestPaths(Object.fromEntries(pathOverrides));
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
  paths:                     PathOverrides;
  hearthstoneImage:          HearthstoneImageOverride | null;
  hearthstonePublishTargets: HearthstonePublishTargetOverride[];
  magicPublishTargets:       MagicPublishTargetOverride[];
  aiConfig:                  AiConfig | null;
  editorIdentity:            string | null;
}

/** Collects all current runtime overrides into a serializable object for Worker transfer. */
export function collectRuntimeOverrides(): RuntimeOverrides {
  return {
    localDatabaseUrl:          readLocalDatabaseUrl(),
    paths:                     readAllPathOverrides(),
    hearthstoneImage:          readHearthstoneImageOverride(),
    hearthstonePublishTargets: readHearthstonePublishTargetOverrides(),
    magicPublishTargets:       readMagicPublishTargetOverrides(),
    aiConfig:                  readAiConfig(),
    editorIdentity:            readEditorIdentity(),
  };
}

/** Restores runtime overrides from a serialized object in the Worker context. */
export function applyRuntimeOverrides(data: RuntimeOverrides): void {
  setLocalDatabaseUrlOverride(data.localDatabaseUrl);
  applyPathOverrides(data.paths);
  setHearthstoneImageOverride(data.hearthstoneImage);
  setHearthstonePublishTargetOverrides(data.hearthstonePublishTargets);
  setMagicPublishTargetOverrides(data.magicPublishTargets);
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
    publishTargetId:   value.publishTargetId?.trim() ?? null,
    environment:       value.environment?.trim() ?? null,
    targetFingerprint: value.targetFingerprint?.trim() ?? null,
    connectionString:  value.connectionString?.trim() ?? null,
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
