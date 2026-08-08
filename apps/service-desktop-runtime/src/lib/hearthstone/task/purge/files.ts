import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** Recursively collects `.webp` files under `dir` whose render hash is in the orphaned set. */
async function collectImageFiles(
  dir: string,
  orphaned: ReadonlySet<string>,
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectImageFiles(full, orphaned, out);
    } else if (entry.isFile() && entry.name.endsWith('.webp')) {
      // Bun's recursive readdir reports only the basename in `entry.name`, so
      // the walk must track the directory explicitly to build real paths.
      const hash = entry.name.slice(0, -'.webp'.length);
      if (orphaned.has(hash)) {
        out.push(full);
      }
    }
  }
}

/**
 * Locates the bucket files whose render hash is in the orphaned set.
 *
 * Image files live at `{bucketDir}/hearthstone/card/{category}/{zone}/{template}/{premium}/{hash.slice(0,2)}/{hash}.webp`.
 * They are matched purely by file name — the `card_image_assets` table is not treated as the source of truth.
 */
export async function locateImageFiles(
  bucketDir: string,
  orphaned: ReadonlySet<string>,
): Promise<string[]> {
  if (orphaned.size === 0) {
    return [];
  }

  const files: string[] = [];
  await collectImageFiles(join(bucketDir, 'hearthstone', 'card'), orphaned, files);
  return files;
}

/** Deletes the given image files, reporting how many succeeded and how many failed. */
export async function deleteImageFiles(
  paths: string[],
): Promise<{ deleted: number, failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const file of paths) {
    try {
      await unlink(file);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { deleted, failed };
}
