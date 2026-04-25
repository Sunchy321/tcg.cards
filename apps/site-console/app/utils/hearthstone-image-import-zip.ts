function fail(message: string): never {
  throw new Error(message);
}

export function normalizeZipEntryNames(entries: string[]) {
  if (entries.length === 0) {
    return new Map<string, string>();
  }

  const allRootLevel = entries.every(entry => !entry.includes('/'));

  if (allRootLevel) {
    return new Map(entries.map(entry => [entry, entry]));
  }

  const topLevelDirs = new Set(entries.map(entry => entry.split('/')[0] ?? ''));

  if (topLevelDirs.size !== 1) {
    fail('ZIP input must contain root-level files or files inside one top-level folder');
  }

  const [topLevelDir] = [...topLevelDirs];

  if (!topLevelDir) {
    fail('ZIP input contains invalid entry names');
  }

  const normalized = new Map<string, string>();

  for (const entry of entries) {
    const prefix = `${topLevelDir}/`;

    if (!entry.startsWith(prefix)) {
      fail('ZIP input must contain root-level files or files inside one top-level folder');
    }

    const fileName = entry.slice(prefix.length);

    if (fileName.length === 0 || fileName.includes('/')) {
      fail(`ZIP input only supports files directly inside the top-level folder: ${entry}`);
    }

    normalized.set(entry, fileName);
  }

  return normalized;
}
