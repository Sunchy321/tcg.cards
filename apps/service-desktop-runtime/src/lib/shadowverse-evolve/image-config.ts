import { resolve } from 'node:path';

/** Source name recorded on Evolve image import batches. */
export const evolveImageSource = 'shadowverse-evolve';

/** Workspace root, resolved from this file's location so the runtime works from any cwd. */
const WORKSPACE = resolve(import.meta.dir, '..', '..', '..', '..', '..');

/** Local bucket directory holding downloaded Evolve card images, git-ignored under /data. */
export function getEvolveImageBucketDir() {
  return resolve(WORKSPACE, 'data', 'shadowverse-evolve', 'images');
}

/** Stable failure-bookkeeping key for one Evolve image asset. */
export function evolveImageAssetKey(lang: string, cardNo: string) {
  return `${lang}:${cardNo}`;
}
