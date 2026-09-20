import { slugifyName } from '@tcg-cards/shared/magic/slug';

import { Card, CardLocalization, CardPart, CardPartLocalization } from '@tcg-cards/db/schema/shared/magic/card';
import { Print, PrintPart } from '@tcg-cards/db/schema/shared/magic/print';
import { CardLocalizationAuthority, ProjectionReview } from '@tcg-cards/db/schema/local/magic';

/**
 * Pure projection of one Magic "unit" into its fact-table base rows.
 *
 * Projection unit = a match unit:
 *   - a normal oracle card is one unit (`oracleId`),
 *   - a `double_faced_token` yields two units (`oracleId:0` / `oracleId:1`),
 *   - a `reversible_card` produces no unit of its own — it only contributes
 *     prints to the units its faces reference.
 *
 * cardId is produced by match, not read as an external input; `AssembledCard`
 * carries the resolved cardId alongside the raw material so the pure function
 * can emit final rows without touching the database.
 *
 * ⚠️ TEST-DRIVEN — READ BEFORE CHANGING ANY MAPPING
 * -------------------------------------------------
 * This projection is covered by golden tests. Rules that MUST be followed:
 *   1. Any change to projection behavior (a field, a derivation, an enum,
 *      a separator, a fallback rule, …) MUST be accompanied by the matching
 *      golden-test update (regenerate the affected card fixtures).
 *   2. Fixing a special case REQUIRES adding a new regression test/fixture for
 *      that case. No special-case branch ships without its test.
 *   3. Never "tune" a fixture by hand to make a test pass — regenerate fixtures
 *      from the real assembled source data, then review the diff.
 */

// ---------------------------------------------------------------------------
// Input types (assembly is responsible for building these from magic_data)
// ---------------------------------------------------------------------------

/** One English oracle face of the unit's card. */
export interface OracleFaceDraft {
  name:           string;
  typeLine:       string;
  oracleText:     string | null;
  manaCost:       string | null;
  cmc:            number | null;
  colors:         string[] | null;
  colorIndicator: string[] | null;
  power:          string | null;
  toughness:      string | null;
  loyalty:        string | null;
  defense:        string | null;
  handModifier:   string | null;
  lifeModifier:   string | null;
}

/** Resolved localized face content for one surface; null falls back to the English oracle face. */
export interface LocalizedFaceDraft {
  name:     string | null;
  typeline: string | null;
  text:     string | null;
}

/** One non-English localized card surface. `faces` length must match the oracle faces. */
export interface CardLocalizationSurface {
  locale:      string;
  /** '' = official print surface, 'mtgch' = community Chinese. */
  source:      string;
  faces:       LocalizedFaceDraft[];
  /** Print that established an official surface (present when source=''). */
  provenance?: { set: string, number: string, releasedAt: string } | null;
}

/** Printed surface of one face (already attributed to this unit's face slot). */
export interface PrintFaceDraft {
  typeLine?:         string | null;
  printedName?:      string | null;
  printedTypeLine?:  string | null;
  printedText?:      string | null;
  flavorName?:       string | null;
  flavorText?:       string | null;
  artist?:           string | null;
  watermark?:        string | null;
  illustrationId?:   string | null;
  attractionLights?: number[] | null;
}

/**
 * One official print of the unit's card. Assembly has attributed the physical
 * object to this unit and resolved which faces belong to it (a normal card
 * keeps all its faces; a DFT/reversible split contributes the single face that
 * belongs to this unit). `layout` is already a value valid for the schema.
 */
export interface PrintDraft {
  lang:       string;
  set:        string;
  number:     string;
  releasedAt: string;

  layout:        string;
  frame:         string;
  frameEffects:  string[] | null;
  borderColor:   string;
  cardBackId:    string | null;
  securityStamp: string | null;
  promoTypes:    string[] | null;
  rarity:        string;
  isDigital:     boolean;
  isPromo:       boolean;
  isReprint:     boolean;
  finishes:      string[];
  imageStatus:   string;
  inBooster:     boolean;
  games:         string[];
  previewDate:   string | null;
  previewSource: string | null;
  previewUri:    string | null;

  fullArt:        boolean;
  oversized:      boolean;
  storySpotlight: boolean;
  textless:       boolean;

  isVariation: boolean;
  variationOf: string | null;
  artistIds:   string[] | null;
  resourceId:  string | null;

  scryfallOracleId: string;
  scryfallCardId:   string;
  scryfallFace:     string | null;

  arenaId:           number | null;
  mtgoId:            number | null;
  mtgoFoilId:        number | null;
  multiverseIds:     number[];
  tcgPlayerId:       number | null;
  tcgplayerEtchedId: number | null;
  cardMarketId:      number | null;

  /** Printed surfaces aligned with this unit's faces (drives print_parts). */
  faces: PrintFaceDraft[];

  /**
   * MTGCH Chinese printed surfaces for zhs prints, aligned with `faces`
   * (entry i feeds face slot i; a null entry means no community value for
   * that slot). Absent/null for non-zhs prints and prints without data —
   * the projection then keeps the scryfall/English fallback chain.
   */
  mtgchFaces?: (LocalizedFaceDraft | null)[] | null;
}

/** MTGCH community Simplified-Chinese surfaces, aligned per oracle face (§S4). */
export interface MtgchOracleDraft {
  faces: LocalizedFaceDraft[];
}

/**
 * Assembled material for ONE unit (one target card).
 */
export interface AssembledCard {
  /** Unit key (oracleId, or `${oracleId}:${i}` for a double_faced_token face). */
  unit:           string;
  /** Resolved card identity (output of match), embedded for row emission. */
  cardId:         string;
  oracleId:       string;
  layout:         string;
  /** Representative English print's set name (used for minigame detection). */
  setName:        string;
  cmc:            number;
  colorIdentity:  string[];
  keywords:       string[];
  producedMana:   string[] | null;
  reserved:       boolean;
  contentWarning: boolean | null;
  legalities:     Record<string, string>;
  /** English oracle faces of this card (single-face cards have one face). */
  faces:          OracleFaceDraft[];
  /** Non-English localized surfaces (§S2 consumes these). */
  localizations?: CardLocalizationSurface[];
  /** Official prints attributed to this unit (consumed by §S3). */
  prints?:        PrintDraft[];
  /** mtgch oracle translation (consumed by §S4). */
  mtgch?:         MtgchOracleDraft | null;
}

// ---------------------------------------------------------------------------
// Row output types
// ---------------------------------------------------------------------------

export interface ProjectCardResult {
  cards:                 (typeof Card)['$inferInsert'][];
  cardParts:             (typeof CardPart)['$inferInsert'][];
  cardLocalizations:     (typeof CardLocalization)['$inferInsert'][];
  cardPartLocalizations: (typeof CardPartLocalization)['$inferInsert'][];
  prints:                (typeof Print)['$inferInsert'][];
  printParts:            (typeof PrintPart)['$inferInsert'][];
  authorities:           (typeof CardLocalizationAuthority)['$inferInsert'][];
  /** Audit rows recording where a community translation replaced the print surface. */
  reviews:               (typeof ProjectionReview)['$inferInsert'][];
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const TYPE_SUPER = new Set(['basic', 'legendary', 'ongoing', 'snow', 'world', 'token', 'elite', 'host', 'elemental']);
const TYPE_MAIN_FIX: Record<string, string> = { eaturecray: 'creature' };

export interface ParsedTypeline {
  typeSuper: string[] | null;
  typeMain:  string[];
  typeSub:   string[] | null;
}

/** Split an English typeline into supertypes, main types and subtypes. */
export function parseTypeline(typeline: string): ParsedTypeline {
  const [main, sub] = typeline.split('—').map(s => s.trim());
  const mainWords = main
    .toLowerCase()
    .split(' ')
    .map(w => TYPE_MAIN_FIX[w] ?? w)
    .filter(w => w !== '');
  const typeSuper = mainWords.filter(w => TYPE_SUPER.has(w));
  const typeMain = mainWords.filter(w => !TYPE_SUPER.has(w));
  const typeSub = sub != null
    ? mainWords.includes('plane')
      ? [slugifyName(sub)]
      : sub.split(/ |(time lord)/i).filter(v => v != null && v !== '').map(slugifyName)
    : null;
  return {
    typeSuper: typeSuper.length > 0 ? typeSuper : null,
    typeMain,
    typeSub,
  };
}

const COLOR_ORDER = 'WUBRGOP';
const MANA_ORDER = 'WUBRGC';

/** Sort a color/color-identity list into the canonical order, joined. */
export function convertColor(colors: string[]): string {
  return [...new Set(colors)]
    .filter(c => COLOR_ORDER.includes(c))
    .sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b))
    .join('');
}

/** Sort a produced-mana list into the canonical order, joined. */
export function convertMana(mana: string[]): string {
  return [...new Set(mana)]
    .filter(c => MANA_ORDER.includes(c))
    .sort((a, b) => MANA_ORDER.indexOf(a) - MANA_ORDER.indexOf(b))
    .join('');
}

/** Split a mana cost like "{1}{W/U}" into its symbol parts. */
export function splitCost(cost: string): string[] {
  return cost.split(/\{([^}]+)\}/).filter(v => v !== '');
}

/** Normalize the unicode dash/plus variants scryfall emits inside symbols. */
export function purifyText(text: string): string {
  const symbolMap: Record<string, string> = {
    '-': '-', '—': '-', '―': '-', '－': '-', '–': '-', '−': '-',
    '＋': '+', '+': '+',
  };
  const numberMap: Record<string, string> = {
    '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
    '５': '5', '６': '6', '７': '7', '８': '8', '９': '9', 'Ｘ': 'X',
  };
  const replacer = (_: string, sym: string, num: string) => `[${symbolMap[sym]}${num.split('').map(n => numberMap[n] ?? n).join('')}]`;
  return text
    .replace(/\{½\}/g, '{H1}')
    .replace(/^([-—―－–−＋+])([0-9X０-９Ｘ]+)(?!\/)/mg, replacer)
    .replace(/\[([-—―－–−＋+])([0-9X０-９Ｘ]+)\]/mg, replacer)
    .replace(/^[0０](?=[:：]| :)/mg, '[0]')
    .replace(/\[０\]/mg, '[0]');
}

/** Canonical legality value for a scryfall legality status. */
function toLegality(status: string): string {
  if (status === 'not_legal') return 'unavailable';
  if (status === 'legal') return 'legal';
  if (status === 'banned') return 'banned';
  if (status === 'restricted') return 'restricted';
  return status;
}

const FORMAT_RENAME: Record<string, string> = {
  duel:            'duelcommander',
  paupercommander: 'pauper_commander',
  standardbrawl:   'standard_brawl',
};

/** Map raw scryfall legalities into the product's format/legality vocabulary. */
export function convertLegalities(legalities: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(legalities).map(([format, status]) => [FORMAT_RENAME[format] ?? format, toLegality(status)]),
  );
}

const TOKEN_RE = /\btoken\b/i;
const CREATES_TOKEN_RE = /\bcreates?|embalm|eternalize|squad|offspring\b/i;
const COUNTER_RE = /\bcounters?\b/;

export type Category = 'advertisement' | 'art' | 'auxiliary' | 'decklist' | 'default' | 'minigame' | 'player' | 'token';

function classify(assembled: AssembledCard): Category {
  if (assembled.faces.some(f => TOKEN_RE.test(f.typeLine))) return 'token';
  if (assembled.setName.endsWith('Minigames')) return 'minigame';
  return 'default';
}

function cardName(assembled: AssembledCard): string {
  return assembled.faces.map(f => f.name).join(' // ');
}

function cardTypeline(assembled: AssembledCard): string {
  return assembled.faces.map(f => f.typeLine ?? '').join(' // ');
}

/**
 * Printed display name of a face. zhs prints take the MTGCH community surface
 * as the authority (verified field-by-field against scryfall; the scryfall
 * printed name is out of the zhs chain), falling back to the English oracle
 * name where MTGCH has nothing. Other languages keep the scryfall printed
 * surface with the oracle fallback.
 */
function displayName(pf: PrintFaceDraft | undefined, oracle: OracleFaceDraft, mtgch?: LocalizedFaceDraft | null): string {
  if (mtgch != null) return mtgch.name ?? oracle.name;
  return pf?.printedName ?? oracle.name;
}

function displayTypeline(pf: PrintFaceDraft | undefined, oracle: OracleFaceDraft, mtgch?: LocalizedFaceDraft | null): string {
  if (mtgch != null) return mtgch.typeline ?? oracle.typeLine ?? '';
  return pf?.printedTypeLine ?? oracle.typeLine ?? '';
}

function displayText(pf: PrintFaceDraft | undefined, oracle: OracleFaceDraft, mtgch?: LocalizedFaceDraft | null): string {
  if (mtgch != null) return purifyText(mtgch.text ?? oracle.oracleText ?? '');
  return purifyText(pf?.printedText ?? oracle.oracleText ?? '');
}

/**
 * Project the unit's official prints into `prints`/`print_parts` rows.
 * `layout`, rarity, frames etc. arrive from assembly already valid for the
 * schema; this function only fills display text and derivable print tags.
 */
function projectPrints(assembled: AssembledCard): {
  prints:     (typeof Print)['$inferInsert'][];
  printParts: (typeof PrintPart)['$inferInsert'][];
} {
  const cardId = assembled.cardId;
  const version = '';
  const prints: (typeof Print)['$inferInsert'][] = [];
  const printParts: (typeof PrintPart)['$inferInsert'][] = [];

  for (const draft of assembled.prints ?? []) {
    // MTGCH faces ride only on zhs drafts (see assembly); the slot may still be
    // null when the community source has no value for that position.
    const mtgchFaces = draft.lang === 'zhs' ? draft.mtgchFaces : null;
    const resolved = draft.faces.map((pf, i) => {
      const oracle = assembled.faces[i];
      const mtgch = mtgchFaces?.[i];
      return {
        name:             displayName(pf, oracle, mtgch),
        typeline:         displayTypeline(pf, oracle, mtgch),
        text:             displayText(pf, oracle, mtgch),
        flavorName:       pf.flavorName ?? null,
        flavorText:       pf.flavorText ?? null,
        artist:           pf.artist ?? null,
        watermark:        pf.watermark ?? null,
        scryfallIllusId:  pf.illustrationId != null ? [pf.illustrationId] : null,
        attractionLights: pf.attractionLights != null ? pf.attractionLights.join('') : null,
      };
    });

    const printTags: string[] = [
      ...(draft.fullArt ? ['full-art'] : []),
      ...(draft.oversized ? ['oversized'] : []),
      ...(draft.storySpotlight ? ['story-spotlight'] : []),
      ...(draft.textless ? ['textless'] : []),
    ];

    const printRow: (typeof Print)['$inferInsert'] = {
      cardId, version,
      set:               draft.set, number:            draft.number, lang:              draft.lang as (typeof Print)['$inferInsert']['lang'], source:            '',
      name:              resolved.map(r => r.name).join(' // '),
      typeline:          resolved.map(r => r.typeline).join(' // '),
      layout:            draft.layout as (typeof Print)['$inferInsert']['layout'],
      frame:             draft.frame as (typeof Print)['$inferInsert']['frame'],
      frameEffects:      draft.frameEffects ?? [],
      borderColor:       draft.borderColor as (typeof Print)['$inferInsert']['borderColor'],
      cardBack:          draft.cardBackId,
      securityStamp:     draft.securityStamp as (typeof Print)['$inferInsert']['securityStamp'],
      promoTypes:        draft.promoTypes,
      rarity:            draft.rarity as (typeof Print)['$inferInsert']['rarity'],
      releaseDate:       draft.releasedAt,
      isDigital:         draft.isDigital,
      isPromo:           draft.isPromo,
      isReprint:         draft.isReprint,
      finishes:          draft.finishes as (typeof Print)['$inferInsert']['finishes'],
      imageStatus:       draft.imageStatus as (typeof Print)['$inferInsert']['imageStatus'],
      inBooster:         draft.inBooster,
      games:             draft.games as (typeof Print)['$inferInsert']['games'],
      previewDate:       draft.previewDate,
      previewSource:     draft.previewSource,
      previewUri:        draft.previewUri,
      printTags,
      isVariation:       draft.isVariation,
      variationOf:       draft.variationOf,
      artistIds:         draft.artistIds ?? [],
      resourceId:        draft.resourceId,
      scryfallOracleId:  draft.scryfallOracleId,
      scryfallCardId:    draft.scryfallCardId,
      scryfallFace:      draft.scryfallFace as (typeof Print)['$inferInsert']['scryfallFace'],
      arenaId:           draft.arenaId,
      mtgoId:            draft.mtgoId,
      mtgoFoilId:        draft.mtgoFoilId,
      multiverseId:      draft.multiverseIds,
      tcgPlayerId:       draft.tcgPlayerId,
      tcgplayerEtchedId: draft.tcgplayerEtchedId,
      cardMarketId:      draft.cardMarketId,
    };
    prints.push(printRow);

    resolved.forEach((r, i) => {
      const partRow: (typeof PrintPart)['$inferInsert'] = {
        cardId, version,
        set:              draft.set, number:           draft.number,
        lang:             printRow.lang, source:           '', partIndex:        i,
        name:             r.name,
        typeline:         r.typeline,
        text:             r.text,
        attractionLights: r.attractionLights,
        flavorName:       r.flavorName,
        flavorText:       r.flavorText,
        artist:           r.artist,
        watermark:        r.watermark,
        scryfallIllusId:  r.scryfallIllusId,
      };
      printParts.push(partRow);
    });
  }

  return { prints, printParts };
}

// ---------------------------------------------------------------------------
// Localization authority (§S4)
// ---------------------------------------------------------------------------

/** Face separator inside a joined whole-card body text. */
const TEXT_FACE_SEPARATOR = `\n${'-'.repeat(20)}\n`;
/** Face separator inside a joined whole-card name or type line. */
const LINE_FACE_SEPARATOR = ' // ';
/** The locale the MTGCH community source translates. */
const MTGCH_LOCALE = 'zhs';
/** The localization role a community-supplied row carries. */
const MTGCH_SOURCE = 'mtgch';

/**
 * Join per-face values into the whole-card form.
 *
 * Lossless on purpose: every face contributes exactly one segment, empty faces
 * included, so splitting the stored value back into faces is exact. Dropping
 * empty segments — what a join of the non-empty parts would do — collapses a
 * two-face card whose first face is empty into a single segment, and the split
 * would then land the surviving text on the wrong face. Neither separator occurs
 * in the source data, so the encoding stays unambiguous.
 */
function joinFaces(values: string[], separator: string): string {
  return values.join(separator);
}

/** Split a joined whole-card value back into its per-face segments. */
function splitFaces(value: string, separator: string): string[] {
  return value.split(separator);
}

/**
 * Whether the unit's MTGCH translation may be adopted at all.
 *
 * A translation is adopted whole or not at all: it is dropped entirely rather
 * than filled in field by field. A face may only be missing a value the card
 * does not have in the first place — the empty rules text of a vanilla creature
 * — because then there is nothing to translate, and the row still carries the
 * translated name. A value missing where the card does have one disqualifies the
 * whole translation. Machine translation counts as usable (`*_source` is 'gpt'
 * for 166 oracle rows); only a missing or empty text where one was to be
 * expected disqualifies.
 *
 * The dataset also grades its translations in `mtgch_zhs_oracle.name_stage`,
 * `type_stage` and `text_stage`, but those numbers are undocumented (the dataset
 * ships no manifest and nothing in this repository defines them) and they do not
 * line up with one another: `name_stage` 0 always means machine translation,
 * `text_stage` 0 means either no text or machine translation, and `type_stage` 0
 * marks nine un-set cards whose type line is deliberately half-translated.
 * Adoption therefore reads the values themselves and ignores the stage numbers.
 */
function adoptableMtgchFaces(assembled: AssembledCard): LocalizedFaceDraft[] | null {
  const faces = assembled.mtgch?.faces;
  if (faces == null || faces.length !== assembled.faces.length) return null;
  const present = (value: string | null | undefined) => value != null && value !== '';
  const complete = faces.every((face, i) => {
    const oracle = assembled.faces[i]!;
    return (present(face.name) || !present(oracle.name))
      && (present(face.typeline) || !present(oracle.typeLine))
      && (present(face.text) || !present(oracle.oracleText));
  });
  return complete ? faces : null;
}

/** Resolve per-face localized content (null falls back to the English oracle face). */
function resolveFaces(assembled: AssembledCard, localized?: LocalizedFaceDraft[] | null): { name: string, typeline: string, text: string }[] {
  return assembled.faces.map((face, i) => {
    const lf = localized?.[i];
    return {
      name:     lf?.name ?? face.name,
      typeline: lf?.typeline ?? face.typeLine ?? '',
      text:     purifyText(lf?.text ?? face.oracleText ?? ''),
    };
  });
}

/**
 * Build the localization authority rows (magic_data.card_localization_authorities).
 *
 * One row per (card, version, locale, source), and at most one row per
 * (card, locale): `source` names the role the row plays.
 *   ''       official standard row — the oracle-aligned text in the official
 *            style. For zhs that is the community translation, which translates
 *            the oracle text in the official style; in every other language the
 *            newest print's surface stands in until an oracle-aligned source
 *            exists.
 *   'mtgch'  folk substitute row — present only when no official standard row
 *            can be formed, most often because the card has no official name in
 *            that language.
 *
 * English is never stored (its text of record is the oracle text), and the print
 * that established the text is recorded only when the text really came from a
 * print: a row that uses MTGCH is overwritten by MTGCH whatever print it anchors
 * to, so it records no print. Where both the print surface and the community
 * translation exist and their bodies differ, an audit row is emitted — the
 * authority keeps the community text.
 */
function buildAuthorities(assembled: AssembledCard): {
  authorities: (typeof CardLocalizationAuthority)['$inferInsert'][];
  reviews:     (typeof ProjectionReview)['$inferInsert'][];
} {
  const cardId = assembled.cardId;
  const version = '';
  const authorities: (typeof CardLocalizationAuthority)['$inferInsert'][] = [];
  const reviews: (typeof ProjectionReview)['$inferInsert'][] = [];

  // Print surfaces keyed by locale (source='', non-English, newest print).
  const official = new Map<string, CardLocalizationSurface>();
  for (const s of assembled.localizations ?? []) {
    if (s.source === '' && s.locale !== 'en' && !official.has(s.locale)) {
      official.set(s.locale, s);
    }
  }

  const folkFaces = adoptableMtgchFaces(assembled);
  const locales = new Set(official.keys());
  if (folkFaces != null) locales.add(MTGCH_LOCALE);

  for (const locale of locales) {
    const off = official.get(locale);
    const offResolved = off != null ? resolveFaces(assembled, off.faces) : null;
    const folkResolved = locale === MTGCH_LOCALE && folkFaces != null ? resolveFaces(assembled, folkFaces) : null;

    let source: string;
    let chosen: { name: string, typeline: string, text: string }[];
    // The provenance triple is written only when a print really established the
    // text; a row carrying community text records no print.
    let provenance: CardLocalizationSurface['provenance'] = null;

    if (offResolved != null) {
      source = '';
      chosen = folkResolved ?? offResolved;
      provenance = folkResolved == null ? off?.provenance ?? null : null;
      if (folkResolved != null) {
        const offBody = joinFaces(offResolved.map(f => f.text), TEXT_FACE_SEPARATOR);
        const folkBody = joinFaces(folkResolved.map(f => f.text), TEXT_FACE_SEPARATOR);
        if (offBody !== folkBody) {
          reviews.push({
            kind:    'card_field_overwrite',
            subject: { cardId, version, locale, source: MTGCH_SOURCE, fieldPath: 'text' },
            payload: { oldValue: offBody, newValue: folkBody },
            status:  'pending',
          });
        }
      }
    } else if (folkResolved != null) {
      source = MTGCH_SOURCE;
      chosen = folkResolved;
    } else {
      continue;
    }

    authorities.push({
      cardId,
      version,
      locale:    locale as (typeof CardLocalizationAuthority.$inferInsert)['locale'],
      source,
      name:      joinFaces(chosen.map(f => f.name), LINE_FACE_SEPARATOR),
      typeline:  joinFaces(chosen.map(f => f.typeline), LINE_FACE_SEPARATOR),
      text:      joinFaces(chosen.map(f => f.text), TEXT_FACE_SEPARATOR),
      partCount: assembled.faces.length,
      ...(provenance != null
        ? { sourceSet: provenance.set, sourceNumber: provenance.number, sourceReleaseDate: provenance.releasedAt }
        : {}),
    });
  }

  return { authorities, reviews };
}

/**
 * Derive one authority row's display rows.
 *
 * The authority is the text of record; `card_localizations` and
 * `card_part_localizations` are its materialised projection, never a second
 * source of text. Kept as a standalone pure function so the derivation can be
 * re-run on its own if an authority row is ever edited outside projection, and
 * so the split-back is covered by the offline fixtures.
 */
export function deriveLocalizations(
  authority: (typeof CardLocalizationAuthority)['$inferInsert'],
): {
  cardLocalization:      (typeof CardLocalization)['$inferInsert'];
  cardPartLocalizations: (typeof CardPartLocalization)['$inferInsert'][];
} {
  const names = splitFaces(authority.name, LINE_FACE_SEPARATOR);
  const typelines = splitFaces(authority.typeline, LINE_FACE_SEPARATOR);
  const texts = splitFaces(authority.text, TEXT_FACE_SEPARATOR);

  const cardLocalization: (typeof CardLocalization)['$inferInsert'] = {
    cardId:   authority.cardId,
    version:  authority.version,
    locale:   authority.locale,
    source:   authority.source,
    name:     authority.name,
    typeline: authority.typeline,
  };

  const cardPartLocalizations: (typeof CardPartLocalization)['$inferInsert'][] = Array.from(
    { length: authority.partCount },
    (_, partIndex) => ({
      cardId:   authority.cardId,
      version:  authority.version,
      locale:   authority.locale,
      source:   authority.source,
      partIndex,
      name:     names[partIndex] ?? '',
      typeline: typelines[partIndex] ?? '',
      text:     texts[partIndex] ?? '',
    }),
  );

  return { cardLocalization, cardPartLocalizations };
}

// ---------------------------------------------------------------------------
// projectCard
// ---------------------------------------------------------------------------

/**
 * Project one unit's assembled material into its base (version='') fact rows.
 *
 * Implements: cards + card_parts (English oracle), the localization authority
 * rows (§S4) and the display rows derived from them, official prints/print_parts
 * (§S3), and the audit rows recording where a community translation replaced the
 * print surface.
 */
export function projectCard(assembled: AssembledCard): ProjectCardResult {
  const cardId = assembled.cardId;
  const version = '';
  const faces = assembled.faces;

  const keywords = assembled.keywords.map(slugifyName);

  const cardTags: string[] = [];
  if (assembled.reserved) cardTags.push('reserved');
  if (faces.some(f => CREATES_TOKEN_RE.test(f.oracleText ?? ''))) cardTags.push('dev:token');
  if (faces.some(f => COUNTER_RE.test(f.oracleText ?? ''))) cardTags.push('dev:counter');

  const cardRow: (typeof Card)['$inferInsert'] = {
    cardId,
    version,
    partCount:        faces.length,
    name:             cardName(assembled),
    typeline:         cardTypeline(assembled),
    manaValue:        assembled.cmc,
    colorIdentity:    convertColor(assembled.colorIdentity),
    keywords,
    counters:         [],
    producibleMana:   assembled.producedMana != null ? convertMana(assembled.producedMana) : null,
    category:         classify(assembled),
    tags:             cardTags,
    legalities:       convertLegalities(assembled.legalities),
    scryfallOracleId: [assembled.oracleId],
    ...(assembled.contentWarning != null ? { hasContentWarning: assembled.contentWarning } : {}),
  };

  const cardParts: (typeof CardPart)['$inferInsert'][] = faces.map((face, partIndex) => {
    const typeline = parseTypeline(face.typeLine);
    return {
      cardId,
      version,
      partIndex,
      name:           face.name,
      typeline:       face.typeLine ?? '',
      text:           purifyText(face.oracleText ?? ''),
      cost:           face.manaCost != null && face.manaCost !== '' ? splitCost(face.manaCost) : null,
      manaValue:      face.cmc ?? null,
      color:          face.colors != null ? convertColor(face.colors) : null,
      colorIndicator: face.colorIndicator != null ? convertColor(face.colorIndicator) : null,
      typeSuper:      typeline.typeSuper,
      typeMain:       typeline.typeMain,
      typeSub:        typeline.typeSub,
      power:          face.power ?? null,
      toughness:      face.toughness ?? null,
      loyalty:        face.loyalty ?? null,
      defense:        face.defense ?? null,
      handModifier:   face.handModifier ?? null,
      lifeModifier:   face.lifeModifier ?? null,
    };
  });

  // --- Localized card surfaces (card_localizations / card_part_localizations) ---
  const cardLocalizations: (typeof CardLocalization)['$inferInsert'][] = [];
  const cardPartLocalizations: (typeof CardPartLocalization)['$inferInsert'][] = [];

  // English display rows mirror the oracle content so the wide views (which join
  // card_localizations × card_part_localizations by locale/source) can render en.
  const enFaces = faces.map(f => ({
    name:     f.name,
    typeline: f.typeLine ?? '',
    text:     purifyText(f.oracleText ?? ''),
  }));
  cardLocalizations.push({
    cardId,
    version,
    locale:   'en',
    source:   '',
    name:     joinFaces(enFaces.map(f => f.name), LINE_FACE_SEPARATOR),
    typeline: joinFaces(enFaces.map(f => f.typeline), LINE_FACE_SEPARATOR),
  });
  enFaces.forEach((f, i) => {
    cardPartLocalizations.push({
      cardId, version,
      locale:    'en', source:    '', partIndex: i,
      name:      f.name, typeline:  f.typeline, text:      f.text,
    });
  });

  // --- Localization authority + the display rows derived from it (§S4) ---
  // Non-English display rows never come from the assembly directly: the
  // authority row is the text of record, and these are its materialised
  // projection, so the two cannot drift apart.
  const { authorities, reviews } = buildAuthorities(assembled);
  for (const authority of authorities) {
    const derived = deriveLocalizations(authority);
    cardLocalizations.push(derived.cardLocalization);
    cardPartLocalizations.push(...derived.cardPartLocalizations);
  }

  // --- Official prints (prints / print_parts) ---
  const { prints, printParts } = projectPrints(assembled);

  return {
    cards: [cardRow],
    cardParts,
    cardLocalizations,
    cardPartLocalizations,
    prints,
    printParts,
    authorities,
    reviews,
  };
}
