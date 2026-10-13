/** Formats whose card pool rotates with set releases (the legacy apply's rotating list). */
export const magicRotatingFormats = [
  'standard',
  'pioneer',
  'modern',
  'extended',
  'alchemy',
  'historic',
  'explorer',
  'timeless',
] as const;

/** Formats that never rotate: every format outside the rotating list. */
export const magicEternalFormats = [
  'legacy',
  'vintage',
  'commander',
  'duelcommander',
  'duelcommander_docfx',
  'leviathan_commander',
  'commander1v1',
  'brawl',
  'standard_brawl',
  'pauper',
  'oathbreaker',
  'penny',
  'canadian_highlander',
  'pauper_commander',
  'pauper_duelcommander',
] as const;

/**
 * Umbrella format keywords for announcement item.format (the hearthstone
 * pattern). Introducing a new umbrella keyword or a new rotating format is an
 * edit to this file; per-format birthday/deathdate windows stay data-driven at
 * apply time.
 */
export const magicFormatKeywordMap: Record<string, string[]> = {
  '#eternal':  [...magicEternalFormats],
  '#standard': [...magicEternalFormats, ...magicRotatingFormats],
  '#alchemy':  ['alchemy', 'historic', 'timeless'],
};
