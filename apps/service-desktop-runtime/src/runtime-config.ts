const localDatabaseUrlOverride = {
  current: null as string | null,
};

const hsdataRepoPathOverride = {
  current: null as string | null,
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
