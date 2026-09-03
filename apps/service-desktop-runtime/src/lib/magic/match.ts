import { and, eq, isNotNull, ne } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { CardSlugResolution, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { slugifyName } from '@tcg-cards/shared/magic/slug';

type Db = typeof db;

/** Source-agnostic face data consumed by cardId derivation. */
export interface NormalizedCardFace {
  name:       string;
  typeLine:   string;
  oracleText: string | null;
  colors:     string[];
  power:      string | null;
  toughness:  string | null;
}

/** Source-agnostic card identity; every source normalizes into this shape. */
export interface NormalizedCard {
  layout:  string;
  setName: string;
  faces:   NormalizedCardFace[];
}

const TYPE_SUPER = new Set(['basic', 'legendary', 'ongoing', 'snow', 'world', 'token', 'elite', 'host', 'elemental']);
const TYPE_MAIN_FIX: Record<string, string> = { eaturecray: 'creature' };

interface ParsedTypeline {
  typeSuper: string[] | null;
  typeMain:  string[];
  typeSub:   string[] | null;
}

/** Split an English typeline into supertypes, main types and subtypes. */
function parseTypeline(typeline: string): ParsedTypeline {
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

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

function convertColor(color: string[]): string {
  return [...color].sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b)).join('');
}

const KEYWORD_CODE: Record<string, string> = {
  'changeling':   'c',
  'deathtouch':   'd',
  'defender':     'e',
  'first strike': 's',
  'flying':       'f',
  'haste':        'h',
  'hexproof':     'x',
  'lifelink':     'l',
  'menace':       'm',
  'reach':        'r',
  'trample':      't',
  'vigilance':    'v',
  'prowess':      'p',
};

const TOKEN_LAYOUTS = ['token', 'flip_token_top', 'flip_token_bottom'];
const SIMPLE_TOKENS = new Set(['treasure', 'food', 'gold', 'shard', 'clue', 'blood', 'powerstone', 'map']);

/**
 * Card → cardId slug, ported from the legacy getId. Non-token cards fall back to
 * the name slug (double-face names joined with `--`); tokens whose name matches
 * their subtype encode color / power-toughness / keyword-coded abilities (`a`
 * for any non-keyword line) so distinct tokens keep distinct ids.
 */
export function slugifyCard(card: NormalizedCard): string {
  const faces = card.layout === 'reversible_card' ? card.faces.slice(0, 1) : card.faces;
  const nameId = faces.map(f => slugifyName(f.name)).join('--');

  if (faces[0]?.name === 'Incubator') return 'incubator!';

  if (TOKEN_LAYOUTS.includes(card.layout)) {
    const face = faces[0]!;
    const { typeMain, typeSub } = parseTypeline(face.typeLine ?? '');

    if (typeSub == null) {
      return typeMain.includes('card') ? nameId : `${nameId}!`;
    }

    const subtype = typeSub.join('-');
    if (nameId !== subtype || SIMPLE_TOKENS.has(subtype)) {
      return `${nameId}!`;
    }

    const attrs: string[] = [];
    const color = convertColor(face.colors ?? []);
    attrs.push(color.length > 0 ? color.toLowerCase() : 'c');

    if (face.power != null && face.toughness != null) {
      attrs.push(`${face.power}${face.toughness}`);
    }

    if (face.oracleText != null && face.oracleText !== '') {
      let codes = '';
      for (const line of face.oracleText.toLowerCase().split('\n')) {
        const split = line.split(/ *, */);
        if (split.every(p => KEYWORD_CODE[p] != null)) {
          codes += split.map(p => KEYWORD_CODE[p]).join('');
          continue;
        }
        const stripped = line.replace(/ *\([^()]+\)$/, '');
        if (KEYWORD_CODE[stripped] != null) {
          codes += KEYWORD_CODE[stripped];
          continue;
        }
        codes += 'a';
      }
      attrs.push(codes);
    }

    if (face.typeLine.includes('Creature') && face.typeLine.includes('Enchantment')) {
      attrs.push('e');
    }

    return `${subtype}!${attrs.join('-')}`;
  }

  if (card.setName.endsWith('Minigames')) {
    return slugifyName(faces[0]?.name ?? '');
  }

  const oracleText = faces[0]?.oracleText ?? '';
  if (/^\(Theme Color: (\{.\})+\)/.test(oracleText)) {
    const m = /^\(Theme Color: ((?:\{.\})+)\)/.exec(oracleText);
    const colors = (m?.[1] ?? '').toLowerCase().replace(/\{(.)\}/g, (_, v: string) => v);
    return `${nameId}-${colors}`;
  }

  return nameId;
}

interface ScryfallFace {
  name?:        string;
  type_line?:   string;
  oracle_text?: string | null;
  colors?:      string[] | null;
  power?:       string | null;
  toughness?:   string | null;
}

/** One card awaiting a cardId: an oracle card, or one face of a double_faced_token. */
interface MatchUnit {
  /** Unit key: oracle_id, or `${oracleId}:${faceIndex}` for double_faced_token faces. */
  key:      string;
  /** Underlying scryfall oracle_id (both faces of a double_faced_token share it). */
  oracleId: string;
  card:     NormalizedCard;
}

function toFace(face: ScryfallFace): NormalizedCardFace {
  return {
    name:       face.name ?? '',
    typeLine:   face.type_line ?? '',
    oracleText: face.oracle_text ?? null,
    colors:     face.colors ?? [],
    power:      face.power ?? null,
    toughness:  face.toughness ?? null,
  };
}

export interface MatchRow {
  oracleId:   string;
  layout:     string;
  name:       string;
  typeLine:   string;
  oracleText: string | null;
  colors:     string[] | null;
  power:      string | null;
  toughness:  string | null;
  setName:    string;
  cardFaces:  unknown[] | null;
}

/** Expand one scryfall row into the match units it contributes. */
export function toMatchUnits(row: MatchRow): MatchUnit[] {
  const faces = (row.cardFaces ?? []) as ScryfallFace[];

  if (row.layout === 'double_faced_token' && faces.length > 0) {
    return faces.map((face, i) => ({
      key:      `${row.oracleId}:${i}`,
      oracleId: row.oracleId,
      card:     { layout: 'token', setName: row.setName, faces: [toFace(face)] },
    }));
  }

  return [{
    key:      row.oracleId,
    oracleId: row.oracleId,
    card:     {
      layout:  row.layout,
      setName: row.setName,
      faces:   faces.length > 0
        ? faces.map(toFace)
        : [{
          name:       row.name,
          typeLine:   row.typeLine,
          oracleText: row.oracleText,
          colors:     row.colors ?? [],
          power:      row.power,
          toughness:  row.toughness,
        }],
    },
  }];
}

export interface MatchResult {
  /**
   * Match-unit key → resolved cardId for non-conflicting cards (incl. annotated).
   * The key is the oracle_id, or `${oracleId}:${faceIndex}` for the two faces of
   * a double_faced_token (which share one oracle_id).
   */
  cardIdByUnit: Map<string, string>;
  /** slug → match-unit keys[] that need manual review (same slug, distinct cards). */
  conflicts:    Map<string, string[]>;
  /**
   * slug → match-unit keys[] whose natural slug already has a resolution row
   * (occupied by other oracles, or reserved) — they must be reviewed, never
   * auto-assigned.
   */
  blocked:      Map<string, string[]>;
}

/**
 * Batch match: compute cardId for every oracle card. Reads the English oracle
 * cards from scryfall_cards, derives each cardId with slugifyCard (double-faced
 * tokens split per face), consults the slug annotation table, and groups by
 * slug. A slug with multiple distinct units becomes a conflict (held for review);
 * a slug with one unit resolves to that cardId.
 */
export async function matchBatch(database: Db = db): Promise<MatchResult> {
  const rows = await database.selectDistinctOn([ScryfallCard.oracleId], {
    oracleId:   ScryfallCard.oracleId,
    layout:     ScryfallCard.layout,
    name:       ScryfallCard.name,
    typeLine:   ScryfallCard.typeLine,
    oracleText: ScryfallCard.oracleText,
    colors:     ScryfallCard.colors,
    power:      ScryfallCard.power,
    toughness:  ScryfallCard.toughness,
    setName:    ScryfallCard.setName,
    cardFaces:  ScryfallCard.cardFaces,
  }).from(ScryfallCard)
    // Reversible cards have a null top-level oracle_id; they are alt-art printings
    // of an existing card, so they carry no match unit of their own (their identity
    // resolves via the faces at projection time).
    // art_series rows are standalone art cards (their own oracle ids); they
    // never represent a playable card, so exclude them from matching.
    .where(and(
      eq(ScryfallCard.lang, 'en'),
      isNotNull(ScryfallCard.oracleId),
      ne(ScryfallCard.layout, 'art_series'),
    ));

  // Slug resolutions map each occupied slug back to its oracle ids; a slug may
  // be shared by several oracles (a card merged from multiple oracle objects).
  const resolutions = await database.select().from(CardSlugResolution);
  const annotationByOracle = new Map<string, string>();
  const resolutionBySlug = new Map<string, (typeof CardSlugResolution)['$inferSelect']>();
  for (const r of resolutions) {
    for (const oid of r.oracleIds) annotationByOracle.set(oid, r.slug);
    resolutionBySlug.set(r.slug, r);
  }

  const cardIdByUnit = new Map<string, string>();
  const slugToUnits = new Map<string, string[]>();

  // isNotNull(oracleId) guarantees a non-null key; the remaining fields are the
  // canonical non-reversible representative, so their runtime shape matches MatchRow.
  for (const row of rows as MatchRow[]) {
    for (const unit of toMatchUnits(row)) {
      // Annotations are oracle_id-keyed, unambiguous only for single-unit cards.
      const annotated = unit.key === unit.oracleId ? annotationByOracle.get(unit.oracleId) : undefined;
      if (annotated !== undefined) {
        cardIdByUnit.set(unit.key, annotated);
        continue;
      }
      const slug = slugifyCard(unit.card);
      const list = slugToUnits.get(slug) ?? [];
      list.push(unit.key);
      slugToUnits.set(slug, list);
    }
  }

  const conflicts = new Map<string, string[]>();
  const blocked = new Map<string, string[]>();

  for (const [slug, keys] of slugToUnits) {
    const resolution = resolutionBySlug.get(slug);
    // A slug that already has a resolution row (occupied by other oracles or
    // reserved) must not be auto-assigned to a new unit — route it to review.
    if (resolution != null) {
      const owned = new Set(resolution.oracleIds.map(o => String(o)));
      if (!keys.every(key => owned.has(key.split(':')[0]!))) {
        blocked.set(slug, keys);
        continue;
      }
    }
    if (keys.length === 1) {
      cardIdByUnit.set(keys[0], slug);
    } else {
      conflicts.set(slug, keys);
    }
  }

  return { cardIdByUnit, conflicts, blocked };
}
