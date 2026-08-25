import { eq } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { CardSlugAnnotation, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
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

export interface MatchResult {
  /** oracle_id → resolved cardId for non-conflicting cards (incl. annotated). */
  cardIdByOracle: Map<string, string>;
  /** slug → oracle_ids[] that need manual review (same name, distinct cards). */
  conflicts:      Map<string, string[]>;
}

/**
 * Batch match: compute cardId for every oracle card. Reads the English name per
 * oracle_id from scryfall_cards, consults the slug annotation table, and groups
 * by slug. A slug with multiple distinct oracle_ids becomes a conflict (held for
 * review); a slug with one oracle_id resolves to that cardId.
 */
export async function matchBatch(database: Db = db): Promise<MatchResult> {
  const rows = await database.selectDistinctOn([ScryfallCard.oracleId], {
    oracleId: ScryfallCard.oracleId,
    name:     ScryfallCard.name,
  }).from(ScryfallCard).where(eq(ScryfallCard.lang, 'en'));

  const annotations = await database.select().from(CardSlugAnnotation);
  const annotationByOracle = new Map(annotations.map(a => [a.oracleId, a.slug]));

  const cardIdByOracle = new Map<string, string>();
  const slugToOracle = new Map<string, string[]>();

  for (const row of rows) {
    const annotated = annotationByOracle.get(row.oracleId);
    if (annotated !== undefined) {
      cardIdByOracle.set(row.oracleId, annotated);
      continue;
    }
    const slug = slugifyName(row.name);
    const list = slugToOracle.get(slug) ?? [];
    list.push(row.oracleId);
    slugToOracle.set(slug, list);
  }

  const conflicts = new Map<string, string[]>();
  for (const [slug, oracles] of slugToOracle) {
    if (oracles.length === 1) {
      cardIdByOracle.set(oracles[0], slug);
    } else {
      conflicts.set(slug, oracles);
    }
  }

  return { cardIdByOracle, conflicts };
}
