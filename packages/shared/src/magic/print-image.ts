/**
 * Layouts whose parts are two printed images (front/back). The site renders
 * these as a flippable card and requests both `<number>.webp` and
 * `<number>⁑.webp`, so both faces are stored.
 *
 * `reversible_card` is deliberately absent: projection splits a reversible
 * object into one single-face print per face (collector numbers decorated
 * a/b, each pinned to its scryfall face), so each of its prints carries one
 * image under its own number — no `<number>⁑` file exists for the layout.
 *
 * The site's `turnable` list in apps/site-magic/app/components/CardImage.vue
 * still flips reversible prints, but across the sibling prints (collector
 * number a/b swapped) rather than through a second stored image, so the two
 * lists are not identical.
 */
export const twoImageLayouts = [
  'battle',
  'double_faced',
  'modal_dfc',
  'transform',
  'transform_token',
] as const;

/**
 * Whether one layout prints a second image. Every other layout — adventure,
 * split, flip, planar, prepare, aftermath, meld, mutate, leveler, class, case,
 * prototype, reversible_card, normal, saga, token … — prints a single image
 * per print row even when the card has several parts, so only one image is
 * stored; the site shows the other parts by rotating or turning that one
 * image, or (reversible_card) as separate prints.
 */
export function isTwoImageLayout(layout: string | null | undefined): boolean {
  return layout != null && (twoImageLayouts as readonly string[]).includes(layout);
}

/**
 * File name of one print's canonical image file: face 0 and single-face
 * prints have no suffix, the back face carries the ⁑ mark, further faces a
 * numeric one. Slashes are the one character a file name may not carry and
 * a collector number may contain, so they become underscores.
 */
export function printImageFileName(number: string, faceIndex?: number): string {
  const safe = number.replaceAll('/', '_');
  if (faceIndex == null || faceIndex === 0) return `${safe}.webp`;
  if (faceIndex === 1) return `${safe}⁑.webp`;
  return `${safe}-${faceIndex}.webp`;
}

/**
 * Asset-store key of one print's canonical image file, relative to the
 * asset root. The same key addresses the local file and the remote object:
 * the local asset bucket mirrors the remote layout exactly (CONTEXT.md,
 * local asset bucket), and the image asset ledger rows use this string as
 * their primary key.
 */
export function printImageKey(set: string, lang: string, number: string, faceIndex?: number): string {
  return `large/${set}/${lang}/${printImageFileName(number, faceIndex)}`;
}

/** One print coordinate parsed back out of an image key. */
export interface PrintImageRef {
  set:       string;
  lang:      string;
  number:    string;
  faceIndex: number;
}

/**
 * Parses one asset-store key back into print coordinates, or null when the
 * key is not a print image (foreign prefix, other extension, wrong depth,
 * empty segment). Forward derivation is the authority — reverse parsing
 * serves diagnostics — so a `-N` suffix reads as face N only from 2 up,
 * which is all `printImageFileName` ever emits; a collector number with a
 * hyphen and no face suffix therefore round-trips untouched.
 */
export function parsePrintImageKey(key: string): PrintImageRef | null {
  const prefix = 'large/';
  const extension = '.webp';
  if (!key.startsWith(prefix) || !key.endsWith(extension)) return null;
  const parts = key.slice(prefix.length, -extension.length).split('/');
  if (parts.length !== 3) return null;
  const [set, lang, stem] = parts;
  if (set == null || lang == null || stem == null || set === '' || lang === '' || stem === '') return null;
  if (stem.endsWith('⁑')) {
    const number = stem.slice(0, -1);
    return number === '' ? null : { set, lang, number, faceIndex: 1 };
  }
  const hyphen = stem.lastIndexOf('-');
  const tail = hyphen > 0 ? stem.slice(hyphen + 1) : '';
  if (/^[2-9]\d*$/.test(tail)) {
    return { set, lang, number: stem.slice(0, hyphen), faceIndex: Number(tail) };
  }
  return { set, lang, number: stem, faceIndex: 0 };
}
