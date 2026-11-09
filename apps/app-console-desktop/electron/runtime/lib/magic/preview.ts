import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { printImageKey } from '@tcg-cards/shared/magic/print-image';

import { resolvePath } from '../game-paths';

/** Reads one stored print image unchanged for the name-reading review page. */
export async function storedFacePreview(
  set: string,
  lang: string,
  number: string,
  faceIndex: number,
): Promise<string | null> {
  const root = resolvePath('magic.image.card');
  if (!root) return null;
  const file = join(root, printImageKey(set, lang, number, faceIndex));
  if (!existsSync(file)) return null;
  return `data:image/webp;base64,${readFileSync(file).toString('base64')}`;
}
