import { and, eq, isNotNull, ne } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { CardSlugResolution, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { slugifyName } from '@tcg-cards/shared/magic/slug';

import { findCardMergeGroup } from './merge-cards';

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
 * for any non-keyword line) plus type markers (`e` enchantment, `a` artifact)
 * so distinct tokens keep distinct ids.
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

    // Same rationale as the enchantment marker: an artifact-only difference
    // must keep otherwise-identical tokens on distinct slugs.
    if (face.typeLine.includes('Creature') && face.typeLine.includes('Artifact')) {
      attrs.push('a');
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

/**
 * Double-sided tokens that are ONE card (their two faces belong together),
 * not two independent token cards — do not split them:
 *   - "Bounty: <name> // Wanted!"
 *   - "Incubator // Phyrexian"
 *   - "Day // Night"
 *   - "The Ring // The Ring Tempts You"
 *   - "Punchcard // Punchcard" (both faces are real content, day//night-like)
 */
export function isSingleCardDoubleFacedToken(names: string[]): boolean {
  if (names.length !== 2) return false;
  const [a, b] = names;
  if (/^Bounty: /i.test(a ?? '') && b === 'Wanted!') return true;
  if (a === 'Incubator' && b === 'Phyrexian') return true;
  if (a === 'Day' && b === 'Night') return true;
  if (a === 'The Ring' && b === 'The Ring Tempts You') return true;
  if (a === 'Punchcard' && b === 'Punchcard') return true;
  if (a === 'Start Your Engines!' && b === 'Max Speed') return true;
  return isContinuedDoubleFacedToken(a ?? '', b ?? '');
}

/**
 * Playtest-style helper cards whose back face continues the front's rules text
 * (`X // X (cont'd)`, optionally `(minigame)` on the front): one physical
 * card, not two faces.
 */
function isContinuedDoubleFacedToken(front: string, back: string): boolean {
  if (!back.endsWith(' (cont\'d)')) return false;
  return back.replace(/ \(cont'd\)$/, '') === front.replace(/ \(minigame\)$/, '');
}

/**
 * Double-sided tokens where the back is a pure art/illustration face (no rules
 * text, no power/toughness) — the back is NOT a card part, it only shows the
 * illustration. These are one card with a single part.
 */
export function isArtBackDoubleFacedToken(names: string[], faces: { oracleText: string | null, power: string | null, toughness: string | null }[]): boolean {
  if (names.length !== 2) return false;
  // Punchcard-like names keep both faces; the art-back rule only applies to
  // same-name tokens whose back face carries no rules text nor P/T.
  if (names[0] === 'Punchcard' && names[1] === 'Punchcard') return false;
  const back = faces[1];
  if (back == null) return false;
  const backIsArt = (back.oracleText ?? '') === '' && back.power == null && back.toughness == null;
  return names[0] === names[1] && backIsArt;
}

/** Expand one scryfall row into the match units it contributes. */
export function toMatchUnits(row: MatchRow): MatchUnit[] {
  const faces = (row.cardFaces ?? []) as ScryfallFace[];

  if (row.layout === 'double_faced_token' && faces.length > 0 && !isSingleCardDoubleFacedToken(faces.map(f => f.name ?? ''))) {
    // Art-back tokens keep only their front face as a card (the back is just
    // illustration); regular double-faced tokens split into two cards per face.
    if (isArtBackDoubleFacedToken(
      faces.map(f => f.name ?? ''),
      faces.map(f => ({ oracleText: f.oracle_text ?? null, power: f.power ?? null, toughness: f.toughness ?? null })),
    )) {
      return [{
        key:      row.oracleId,
        oracleId: row.oracleId,
        card:     { layout: 'token', setName: row.setName, faces: [toFace(faces[0]!)] },
      }];
    }
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
    // front_card rows are single-word "front" pages (not playable cards).
    .where(and(
      eq(ScryfallCard.lang, 'en'),
      isNotNull(ScryfallCard.oracleId),
      ne(ScryfallCard.layout, 'art_series'),
      ne(ScryfallCard.layout, 'front_card'),
    ));

  // Slug resolutions map member units (oracle id, or `oracleId:faceIndex` for a
  // double-faced-token face) to their resolved slug. A slug may be shared by
  // several units (a card merged from multiple oracle/face objects).
  const resolutions = await database.select().from(CardSlugResolution);
  const annotationByUnit = new Map<string, string>();
  const resolutionBySlug = new Map<string, (typeof CardSlugResolution)['$inferSelect']>();
  for (const r of resolutions) {
    for (const unitId of r.unitIds) annotationByUnit.set(unitId, r.slug);
    resolutionBySlug.set(r.slug, r);
  }

  const cardIdByUnit = new Map<string, string>();
  const slugToUnits = new Map<string, string[]>();

  // isNotNull(oracleId) guarantees a non-null key; the remaining fields are the
  // canonical non-reversible representative, so their runtime shape matches MatchRow.
  for (const row of rows as MatchRow[]) {
    for (const unit of toMatchUnits(row)) {
      // Resolutions are keyed by the exact unit key (incl. DFT `oracleId:face`).
      const annotated = annotationByUnit.get(unit.key);
      if (annotated !== undefined) {
        cardIdByUnit.set(unit.key, annotated);
        continue;
      }
      // Hard-merged oracle pairs (B.F.M.) share one cardId and never conflict.
      const mergeGroup = findCardMergeGroup(unit.oracleId);
      if (mergeGroup != null) {
        cardIdByUnit.set(unit.key, mergeGroup.slug);
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
    // A slug that already has a resolution row (occupied by other units or
    // reserved) must not be auto-assigned to a new unit — route it to review.
    if (resolution != null) {
      const owned = new Set(resolution.unitIds);
      if (!keys.every(key => owned.has(key))) {
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
