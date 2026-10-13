import { deburr } from 'lodash-es';

/** Canonical slug every underscore-only name normalizes to. */
const UNDERSCORE_ONLY_SLUG = '_____';

/**
 * Name → identifier slug. Diacritics decompose to base letters (ö→o, no
 * separator); `//` and a single `/` double-face shorthand become the `--` face
 * boundary, but a `/` ending in `mog` (the card `Summon: Choco/Mog`) is exempt
 * as a single-faced name; apostrophes are dropped; remaining non-alphanumeric
 * runs become `-`. Underscore runs of 4+ survive as the canonical blank run
 * (`_____`, the fixed-length marker for blank names, so `_____ Goblin` keeps
 * its blank prefix); shorter runs are plain separators, and a name made only
 * of underscores normalizes to the canonical blank run.
 */
export function slugifyName(name: string): string {
  const slug = deburr(name)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/ ?\/\/ ?/g, 'z9z')
    .replace(/\/(?!mog$)/g, 'z9z')
    // Protect already-present runs of '--' (used for disambiguated variants).
    .replace(/-{2,}/g, 'd9d')
    // Protect long underscore runs: they normalize to the canonical blank run
    // instead of collapsing into a `-` (and being trimmed away at the edges).
    .replace(/_{4,}/g, 'u9u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/z9z/g, '--')
    .replace(/d9d/g, '--')
    .replace(/^-+|-+$/g, '')
    .replace(/u9u/g, '_____');

  if (slug === '' && name.includes('_')) return UNDERSCORE_ONLY_SLUG;
  return slug;
}

/**
 * Normalizer for manually assigned slugs (slug-conflict review): same rules as
 * slugifyName, but `!` is kept in place — stored slugs use it as the token
 * marker, so an assigned slug must be able to contain it. Underscores are kept
 * in place too, so a reviewer can assign an underscore-only slug or embed `_`
 * in a disambiguated variant. The placeholders must be slug-safe, otherwise
 * slugifyName would collapse them into a `-` run.
 */
export function slugifySlugInput(value: string): string {
  return slugifyName(value.replace(/!/g, 'q8q').replace(/_/g, 'q7q')).replace(/q8q/g, '!').replace(/q7q/g, '_');
}
