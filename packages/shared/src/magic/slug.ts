import { deburr } from 'lodash-es';

/**
 * Name → identifier slug. Diacritics decompose to base letters (ö→o, no
 * separator); `//` and a single `/` double-face shorthand become the `--` face
 * boundary, but a `/` ending in `mog` (the card `Summon: Choco/Mog`) is exempt
 * as a single-faced name; apostrophes are dropped; remaining non-alphanumeric
 * runs become `-`.
 */
export function slugifyName(name: string): string {
  return deburr(name)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/ ?\/\/ ?/g, 'z9z')
    .replace(/\/(?!mog$)/g, 'z9z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/z9z/g, '--')
    .replace(/^-+|-+$/g, '');
}
