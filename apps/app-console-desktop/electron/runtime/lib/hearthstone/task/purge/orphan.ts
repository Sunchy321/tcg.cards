/** Returns the render hashes that are no longer referenced by any live localization row. */
export function computeOrphanedRenderHashes(
  softDeleted: Iterable<string>,
  live: Iterable<string>,
): Set<string> {
  const liveSet = new Set(live);
  const orphaned = new Set<string>();
  for (const hash of softDeleted) {
    if (!liveSet.has(hash)) orphaned.add(hash);
  }
  return orphaned;
}
