import type { PrintCommitFace } from '@tcg-cards/db/schema/local/magic';

/**
 * Gatherer-side completion candidate logic that is pure by construction:
 * turning cached Gatherer card rows into commit face slots, mapping the
 * site's language entries onto commit locales, and deciding whether a
 * position's MTGCH and Gatherer surfaces agree. The oRPC handlers run the
 * database queries; these decisions are what the offline tests pin.
 */

/** One Gatherer face row as the candidate query returns it (jsonb fields selected as text). */
export interface GathererFaceRow {
  languageCode:     string;
  languageName:     string;
  oracleName:       string;
  instanceName:     string;
  instanceTypeLine: string;
  instanceText:     string;
  flavorText:       string;
}

/**
 * Maps a Gatherer language entry onto a commit locale, or null when the row
 * cannot feed a completion. Gatherer reports both Chinese scripts as
 * languageCode `zh` and only separates them through the language name, and
 * its Portuguese entries mix two naming conventions for the same script.
 */
export function gathererLocale(row: Pick<GathererFaceRow, 'languageCode' | 'languageName'>): string | null {
  switch (row.languageCode) {
  case 'en': return null;
  case 'zh': return row.languageName === 'Chinese Traditional' ? 'zht' : 'zhs';
  case 'de':
  case 'es':
  case 'fr':
  case 'it':
  case 'ja':
  case 'ko':
  case 'pt':
  case 'ru':
    return row.languageCode;
  default: return null;
  }
}

/**
 * Cleans one Gatherer printed surface into commit text. The site encodes
 * tags as HTML entities, separates lines with a literal `+|`, and leaves
 * real `<i>`/`<b>` markup in older rows; entities decode first so both tag
 * forms strip, then the line separators become real newlines.
 */
export function normalizeGathererText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\+\|/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '\n');
  return text.trim() === '' ? null : text.trim();
}

/** Whether the value carries content (non-empty after trim). */
function present(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

/**
 * Builds the commit face slots for one candidate position from its Gatherer
 * face rows, aligned with the oracle's face count. Rows join to face slots by
 * their English face name (the `oracleName`); a row that matches no face name
 * fills the lowest still-empty slot, and surplus rows are dropped. Only
 * asserted fields land in a slot — the rest fall back to the English
 * baseline at projection. Artist is never asserted: the name is not
 * localized, so the baseline already carries it.
 */
export function buildGathererFaces(
  rows: GathererFaceRow[],
  faceNames: string[],
  faceCount: number,
): Array<Partial<PrintCommitFace>> {
  const slots: Array<Partial<PrintCommitFace>> = Array.from({ length: faceCount }, () => ({}));
  const filled = new Set<number>();
  const unmatched: GathererFaceRow[] = [];

  for (const row of rows) {
    const wanted = row.oracleName.trim().toLowerCase();
    const index = faceNames.findIndex(name => name.trim().toLowerCase() === wanted);
    if (index >= 0 && !filled.has(index)) {
      fillSlot(slots[index]!, row);
      filled.add(index);
    } else {
      unmatched.push(row);
    }
  }
  for (const row of unmatched) {
    const index = slots.findIndex((_, i) => !filled.has(i));
    if (index < 0) break;
    fillSlot(slots[index]!, row);
    filled.add(index);
  }
  return slots;
}

function fillSlot(slot: Partial<PrintCommitFace>, row: GathererFaceRow): void {
  const name = normalizeGathererText(row.instanceName);
  const typeline = normalizeGathererText(row.instanceTypeLine);
  const text = normalizeGathererText(row.instanceText);
  const flavorText = normalizeGathererText(row.flavorText);
  if (name != null) slot.printedName = name;
  if (typeline != null) slot.printedTypeLine = typeline;
  if (text != null) slot.printedText = text;
  if (flavorText != null) slot.flavorText = flavorText;
}

/**
 * Whether the two sources' surfaces for one position agree on the core
 * translation. Only fields both sides assert take part — a source staying
 * silent is a coverage gap, not a translation conflict — and whitespace
 * runs collapse, so the same words with different line breaking count as
 * equal. Flavor and artist never decide: MTGCH asserts flavor names the
 * official site does not carry.
 */
export function gathererSurfacesAgree(
  mtgch: Array<Partial<PrintCommitFace>>,
  gatherer: Array<Partial<PrintCommitFace>>,
): boolean {
  const compareFields = ['printedName', 'printedTypeLine', 'printedText'] as const;
  const length = Math.max(mtgch.length, gatherer.length);
  for (let i = 0; i < length; i++) {
    const left = mtgch[i] ?? {};
    const right = gatherer[i] ?? {};
    for (const field of compareFields) {
      const a = left[field];
      const b = right[field];
      if (!present(a) || !present(b)) continue;
      if (canonical(a) !== canonical(b)) return false;
    }
  }
  return true;
}

function canonical(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Whether a cached Gatherer row is the locale a commit language asks for.
 * Gatherer reports both Chinese scripts as languageCode `zh`, so the language
 * name decides; every other commit locale maps to its code directly.
 */
export function gathererLocaleMatches(lang: string, row: Pick<GathererFaceRow, 'languageCode' | 'languageName'>): boolean {
  if (lang === 'zhs') return row.languageCode === 'zh' && row.languageName !== 'Chinese Traditional';
  if (lang === 'zht') return row.languageCode === 'zh' && row.languageName === 'Chinese Traditional';
  return row.languageCode === lang;
}

/**
 * Per-face Gatherer multiverse IDs of one position, aligned with the oracle's
 * face slots by English face name — the same matching rules as
 * buildGathererFaces. Gatherer represents some two-faced prints (flip, most
 * single-page transform locals) as ONE row for the whole print; such a row
 * fills face 0 and the back face simply has no id. The result is compact —
 * only the ids that exist, in face order — so `[86428]` is a one-page flip
 * print and `[588126, 588127]` a two-row transform. Null when Gatherer has
 * no row for the position at all.
 */
export function alignedGathererMultiverseIds(
  rows: Array<Pick<GathererFaceRow, 'oracleName'> & { multiverseId: number }>,
  faceNames: string[],
  faceCount: number,
): number[] | null {
  const ids: Array<number | null> = Array.from({ length: faceCount }, () => null);
  const filled = new Set<number>();
  const unmatched: Array<Pick<GathererFaceRow, 'oracleName'> & { multiverseId: number }> = [];

  for (const row of rows) {
    const wanted = row.oracleName.trim().toLowerCase();
    const index = faceNames.findIndex(name => name.trim().toLowerCase() === wanted);
    if (index >= 0 && !filled.has(index)) {
      ids[index] = row.multiverseId;
      filled.add(index);
    } else {
      unmatched.push(row);
    }
  }
  // Name-unmatched rows fill the remaining slots in order — one Gatherer row
  // per print still identifies the print, whichever face it names.
  for (const row of unmatched) {
    const index = ids.findIndex((_, i) => !filled.has(i));
    if (index < 0) break;
    ids[index] = row.multiverseId;
    filled.add(index);
  }
  return filled.size === 0 ? null : ids.filter((id): id is number => id != null);
}
