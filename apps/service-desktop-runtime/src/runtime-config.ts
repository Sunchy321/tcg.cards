const localDatabaseUrlOverride = {
  current: null as string | null,
};

const hsdataRepoPathOverride = {
  current: null as string | null,
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
