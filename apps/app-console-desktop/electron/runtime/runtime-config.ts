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

/** R2 credentials injected by the desktop shell for search-package publication. */
export interface SearchR2Override {
  accountId:       string | null;
  accessKeyId:     string | null;
  secretAccessKey: string | null;
}

const searchR2Override = { current: null as SearchR2Override | null };

/** Stores the search-object-storage settings in the task worker's runtime. */
export function setSearchR2Override(value: SearchR2Override | null): void {
  searchR2Override.current = value;
}

/** Reads the search-object-storage settings for a desktop publishing task. */
export function readSearchR2Override(): SearchR2Override | null {
  return searchR2Override.current;
}

/** Authenticated console-service session injected by the desktop shell for search D1 publication. */
export interface SearchD1SessionOverride {
  baseUrl:      string;
  cookieHeader: string;
}

const searchD1SessionOverride = { current: null as SearchD1SessionOverride | null };

/** Stores the console-service session in the task worker's runtime. */
export function setSearchD1SessionOverride(value: SearchD1SessionOverride | null): void {
  searchD1SessionOverride.current = value;
}

/** Reads the console-service session for a desktop search D1 publishing task. */
export function readSearchD1SessionOverride(): SearchD1SessionOverride | null {
  return searchD1SessionOverride.current;
}

/** One publish destination injected by the desktop shell; secrets stay in the main process. */
export interface PublishTargetOverride {
  id:                string | null;
  name:              string | null;
  kind:              'direct' | 'account';
  connectionString:  string | null;
  targetFingerprint: string | null;
}

const publishTargetOverrides = {
  current: [] as PublishTargetOverride[],
};

/** Stores the runtime-local publish destinations provided by the desktop shell. */
export function setPublishTargets(value: PublishTargetOverride[]) {
  publishTargetOverrides.current = value.map(target => ({
    id:                target.id?.trim() ?? null,
    name:              target.name?.trim() ?? null,
    kind:              target.kind,
    connectionString:  target.connectionString?.trim() ?? null,
    targetFingerprint: target.targetFingerprint?.trim() ?? null,
  }));
}

/** Lists every runtime-local publish destination. */
export function readPublishTargets() {
  return publishTargetOverrides.current;
}

/** Resolves one publish destination by its user-visible name. */
export function findPublishTargetByName(name: string | null | undefined) {
  const expected = name?.trim();
  if (!expected) return null;
  return readPublishTargets().find(target => target.name === expected) ?? null;
}

/** Resolves one publish destination by its stable identifier. */
export function findPublishTargetById(id: string | null | undefined) {
  const expected = id?.trim();
  if (!expected) return null;
  return readPublishTargets().find(target => target.id === expected) ?? null;
}

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
  localDatabaseUrl: string | null;
  paths:            PathOverrides;
  hearthstoneImage: HearthstoneImageOverride | null;
  publishTargets:   PublishTargetOverride[];
  searchR2:         SearchR2Override | null;
  searchD1Session:  SearchD1SessionOverride | null;
  yugiohImage:      YugiohImageOverride | null;
  aiConfig:         AiConfig | null;
  editorIdentity:   string | null;
}

/** Collects all current runtime overrides into a serializable object for Worker transfer. */
export function collectRuntimeOverrides(): RuntimeOverrides {
  return {
    localDatabaseUrl: readLocalDatabaseUrl(),
    paths:            readAllPathOverrides(),
    hearthstoneImage: readHearthstoneImageOverride(),
    publishTargets:   readPublishTargets(),
    searchR2:         readSearchR2Override(),
    searchD1Session:  readSearchD1SessionOverride(),
    yugiohImage:      readYugiohImageOverride(),
    aiConfig:         readAiConfig(),
    editorIdentity:   readEditorIdentity(),
  };
}

/** Restores runtime overrides from a serialized object in the Worker context. */
export function applyRuntimeOverrides(data: RuntimeOverrides): void {
  setLocalDatabaseUrlOverride(data.localDatabaseUrl);
  applyPathOverrides(data.paths);
  setHearthstoneImageOverride(data.hearthstoneImage);
  setPublishTargets(data.publishTargets);
  setSearchR2Override(data.searchR2);
  setSearchD1SessionOverride(data.searchD1Session);
  setYugiohImageOverride(data.yugiohImage);
  setAiConfig(data.aiConfig);
  setEditorIdentity(data.editorIdentity);
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
