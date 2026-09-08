import { resolve } from 'node:path';

import type { ImageAssetKind } from '@tcg-cards/db/schema/local/shadowverse/image-import';
import type { ShadowverseLang } from '#model/shadowverse/schema/data/card-list';

export const shadowverseImageSource = 'shadowverse-wb';

/** Workspace root, resolved from this file's location so the runtime works from any cwd. */
const WORKSPACE = resolve(import.meta.dir, '..', '..', '..', '..', '..');

/** Local bucket directory holding downloaded Shadowverse card images, git-ignored under /data. */
export function getShadowverseImageBucketDir() {
  return resolve(WORKSPACE, 'data', 'shadowverse', 'images');
}

/** Uploads subdirectory for one asset kind: full art lives under card/, banners under list/. */
export function imageKindDirectory(kind: ImageAssetKind) {
  return kind.startsWith('banner') ? 'list' : 'card';
}

/** Official uploads URL for one image asset; hashes are language-specific. */
export function buildImageUrl(lang: ShadowverseLang, kind: ImageAssetKind, hash: string) {
  const resourceLang = { ja: 'jpn', en: 'eng', cht: 'cht', chs: 'chs', ko: 'kor' }[lang];
  return `https://shadowverse-wb.com/uploads/card_image/${resourceLang}/${imageKindDirectory(kind)}/${hash}.png`;
}

/** Stable failure-bookkeeping key for one image asset. */
export function imageAssetKey(lang: ShadowverseLang, kind: ImageAssetKind, cardId: number, styleIndex: number) {
  return `${lang}:${kind}:${cardId}:${styleIndex}`;
}
