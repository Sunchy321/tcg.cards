import type { Locale } from '#model/hearthstone/schema/basic';

/** Selects substring or exact matching for one ordinary text value. */
export type HearthstoneTextOperator = ':' | '=';

const localeTags: Record<Locale, string> = {
  en:  'en',
  de:  'de',
  es:  'es',
  fr:  'fr',
  it:  'it',
  ja:  'ja',
  ko:  'ko',
  mx:  'es-MX',
  pl:  'pl',
  pt:  'pt',
  ru:  'ru',
  th:  'th',
  zhs: 'zh-Hans',
  zht: 'zh-Hant',
};

const europeanReplacements: Array<[string, string]> = [
  ['œ', 'oe'],
  ['æ', 'ae'],
  ['’', '\''],
  ['«', '"'],
  ['»', '"'],
  ['ä', 'ae'],
  ['ü', 'ue'],
  ['ö', 'oe'],
  ['ß', 'ss'],
];

/** Removes game markup and applies the locale-sensitive card-text cleanup. */
function cleanCardText(value: string, lang: Locale): string {
  return value
    .replace(/<[^>]*>/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase(localeTags[lang]);
}

/** Applies only the game's curly-apostrophe query conversion and locale casing. */
export function normalizeHearthstoneQuery(value: string, lang: Locale): string {
  const apostropheNormalized = lang === 'de' || lang === 'fr'
    ? value
    : value.replace(/[‘’]/gu, '\'');
  return apostropheNormalized
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase(localeTags[lang]);
}

/** Produces card-only fallbacks in the order used by the game search. */
export function hearthstoneCardTextVariants(value: string, lang: Locale): string[] {
  const original = cleanCardText(value, lang);
  const european = europeanReplacements.reduce(
    (text, [from, to]) => text.replaceAll(from, to),
    original,
  );
  const markless = european
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .normalize('NFC');
  return [...new Set([original, european, markless])];
}

/** Matches one field without folding or transliterating the query text. */
export function matchesHearthstoneText(
  value: string | null | undefined,
  query: string,
  lang: Locale,
  operator: HearthstoneTextOperator = ':',
): boolean {
  if (value == null) {
    return false;
  }
  const normalizedQuery = normalizeHearthstoneQuery(query, lang);
  const variants = hearthstoneCardTextVariants(value, lang);
  if (normalizedQuery === '') {
    return variants[0] === '';
  }
  return variants.some(candidate =>
    operator === '=' ? candidate === normalizedQuery : candidate.includes(normalizedQuery),
  );
}
