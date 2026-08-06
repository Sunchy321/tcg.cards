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
  publishTargetId: string | null;
  environment: string | null;
  targetFingerprint: string | null;
  connectionString: string | null;
}

const hearthstonePublishTargetOverride = {
  current: null as HearthstonePublishTargetOverride | null,
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
  if (value == null) {
    hearthstonePublishTargetOverride.current = null;
    return;
  }

  hearthstonePublishTargetOverride.current = {
    publishTargetId: value.publishTargetId?.trim() ?? null,
    environment: value.environment?.trim() ?? null,
    targetFingerprint: value.targetFingerprint?.trim() ?? null,
    connectionString: value.connectionString?.trim() ?? null,
  };
}

/** Resolves the active Hearthstone publish target override from runtime memory. */
export function readHearthstonePublishTargetOverride() {
  return hearthstonePublishTargetOverride.current;
}

/** Reports whether the runtime currently has a complete Hearthstone publish target override. */
export function hasHearthstonePublishTargetOverride() {
  const target = readHearthstonePublishTargetOverride();

  return target?.publishTargetId != null
    && target.environment != null
    && target.targetFingerprint != null
    && target.connectionString != null;
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
