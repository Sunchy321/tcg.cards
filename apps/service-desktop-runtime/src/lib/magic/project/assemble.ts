import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';

import type { createDb } from '@tcg-cards/db';
import { MtgchScryfallCard, MtgchZhsCard, MtgchZhsOracle, ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { isArtBackDoubleFacedToken, isSingleCardDoubleFacedToken, slugifyCard, toMatchUnits } from '../match';
import { findCardMergeGroup } from '../merge-cards';

import { stripNameRuby } from '@tcg-cards/model/magic/name-ruby';

import type { AssembledCard, CardLocalizationSurface, LocalizedFaceDraft, OracleFaceDraft, PrintDraft, PrintFaceDraft } from './project-card';

type CardRow = (typeof ScryfallCard)['$inferSelect'];

/** One raw scryfall card row (source of assembly and print drafts). */
export type { CardRow as ScryfallRow };

/** Database client shape used by assembly (created by the caller). */
export type ProjectDb = ReturnType<typeof createDb>;

/** A raw scryfall card_faces entry (snake_case keys as stored in the cache). */
interface RawFace {
  name?:              string;
  type_line?:         string;
  oracle_text?:       string | null;
  mana_cost?:         string | null;
  cmc?:               number | null;
  colors?:            string[] | null;
  color_indicator?:   string[] | null;
  power?:             string | null;
  toughness?:         string | null;
  loyalty?:           string | null;
  defense?:           string | null;
  hand_modifier?:     string | null;
  life_modifier?:     string | null;
  printed_name?:      string | null;
  printed_type_line?: string | null;
  printed_text?:      string | null;
  flavor_name?:       string | null;
  flavor_text?:       string | null;
  artist?:            string | null;
  watermark?:         string | null;
  illustration_id?:   string | null;
  attraction_lights?: number[] | null;
  oracle_id?:         string | null;
}

/**
 * Scryfall sometimes stores the joined whole-card value (`A // B`) on each
 * card_faces[i].printed_* slot; split it back and take this face's segment.
 * Values without the separator pass through unchanged. Applied to names and
 * type lines only — face rules text carries no joined-form convention.
 */
export function faceValue(value: string | null | undefined, faceIndex: number): string | null {
  if (value == null) return null;
  if (!value.includes(' // ')) return value;
  return value.split(' // ')[faceIndex] ?? value;
}


/** Strips upstream-flattened furigana glosses (`漢字（かな）`) from Japanese print surfaces. */
function cleanSurface(row: CardRow, value: string | null): string | null {
  if (row.lang !== 'ja' || value == null) return value;
  return stripNameRuby(value);
}

/** Faces of a print, aligned to the card's oracle faces. */
function printFaces(row: CardRow): PrintFaceDraft[] {
  const faces = (row.cardFaces as RawFace[] | null) ?? [];
  if (faces.length === 0) {
    return [{
      typeLine:         row.typeLine ?? null,
      printedName:      cleanSurface(row, row.printedName ?? null),
      printedTypeLine:  cleanSurface(row, row.printedTypeLine ?? null),
      printedText:      row.printedText ?? null,
      flavorName:       cleanSurface(row, row.flavorName ?? null),
      flavorText:       row.flavorText ?? null,
      artist:           row.artist ?? null,
      watermark:        row.watermark ?? null,
      illustrationId:   row.illustrationId ?? null,
      attractionLights: row.attractionLights ?? null,
    }];
  }
  return faces.map((f, i) => ({
    typeLine:         f.type_line ?? null,
    printedName:      cleanSurface(row, faceValue(f.printed_name, i)),
    printedTypeLine:  cleanSurface(row, faceValue(f.printed_type_line, i)),
    printedText:      f.printed_text ?? null,
    flavorName:       cleanSurface(row, f.flavor_name ?? null),
    flavorText:       f.flavor_text ?? null,
    artist:           f.artist ?? null,
    watermark:        f.watermark ?? null,
    illustrationId:   f.illustration_id ?? null,
    attractionLights: f.attraction_lights ?? null,
  }));
}

/** Oracle faces from an English row (multi-face cards use card_faces). */
function oracleFaces(row: CardRow): OracleFaceDraft[] {
  const faces = (row.cardFaces as RawFace[] | null) ?? [];
  if (faces.length === 0) {
    return [{
      name:           row.name,
      typeLine:       row.typeLine ?? '',
      oracleText:     row.oracleText ?? null,
      manaCost:       row.manaCost ?? null,
      cmc:            row.cmc,
      colors:         row.colors ?? null,
      colorIndicator: row.colorIndicator ?? null,
      power:          row.power ?? null,
      toughness:      row.toughness ?? null,
      loyalty:        row.loyalty ?? null,
      defense:        row.defense ?? null,
      handModifier:   row.handModifier ?? null,
      lifeModifier:   row.lifeModifier ?? null,
    }];
  }
  return faces.map(f => ({
    name:           f.name ?? '',
    typeLine:       f.type_line ?? '',
    oracleText:     f.oracle_text ?? null,
    manaCost:       f.mana_cost ?? null,
    cmc:            f.cmc ?? null,
    colors:         f.colors ?? null,
    colorIndicator: f.color_indicator ?? null,
    power:          f.power ?? null,
    toughness:      f.toughness ?? null,
    loyalty:        f.loyalty ?? null,
    defense:        f.defense ?? null,
    handModifier:   f.hand_modifier ?? null,
    lifeModifier:   f.life_modifier ?? null,
  }));
}

function toPrintDraft(row: CardRow): PrintDraft {
  return {
    lang:              row.lang, set:               row.set, number:            row.collectorNumber, releasedAt:        row.releasedAt,
    layout:            row.layout,
    frame:             row.frame,
    frameEffects:      row.frameEffects ?? null,
    borderColor:       row.borderColor,
    cardBackId:        row.cardBackId,
    securityStamp:     row.securityStamp,
    promoTypes:        row.promoTypes ?? null,
    rarity:            row.rarity,
    isDigital:         row.digital,
    isPromo:           row.promo,
    isReprint:         row.reprint,
    finishes:          row.finishes,
    imageStatus:       row.imageStatus,
    inBooster:         row.booster,
    games:             row.games,
    previewDate:       null,
    previewSource:     null,
    previewUri:        null,
    fullArt:           row.fullArt,
    oversized:         row.oversized,
    storySpotlight:    row.storySpotlight,
    textless:          row.textless,
    isVariation:       row.variation,
    variationOf:       row.variationOf,
    artistIds:         row.artistIds ?? null,
    resourceId:        row.resourceId,
    scryfallOracleId:  row.oracleId ?? '',
    scryfallCardId:    row.cardId,
    scryfallFace:      null,
    arenaId:           row.arenaId,
    mtgoId:            row.mtgoId,
    mtgoFoilId:        row.mtgoFoilId,
    multiverseIds:     row.multiverseIds ?? [],
    tcgPlayerId:       row.tcgplayerId,
    tcgplayerEtchedId: row.tcgplayerEtchedId,
    cardMarketId:      row.cardmarketId,
    faces:             printFaces(row),
  };
}

/** Localized faces of one print (official surface). */
function localizedFaces(row: CardRow): LocalizedFaceDraft[] {
  const faces = (row.cardFaces as RawFace[] | null) ?? [];
  if (faces.length === 0) {
    return [{
      name:     cleanSurface(row, row.printedName ?? null),
      typeline: cleanSurface(row, row.printedTypeLine ?? null),
      text:     row.printedText ?? null,
    }];
  }
  return faces.map((f, i) => ({
    name:     cleanSurface(row, faceValue(f.printed_name, i)),
    typeline: cleanSurface(row, faceValue(f.printed_type_line, i)),
    text:     f.printed_text ?? null,
  }));
}

/** Printed surface of exactly one face slot of a print row. */
function printFaceAt(row: CardRow, faceIndex: number): PrintFaceDraft {
  const faces = (row.cardFaces as RawFace[] | null) ?? [];
  const f = faces[faceIndex];
  if (f == null) {
    return {
      typeLine:         row.typeLine ?? null,
      printedName:      cleanSurface(row, row.printedName ?? null),
      printedTypeLine:  cleanSurface(row, row.printedTypeLine ?? null),
      printedText:      row.printedText ?? null,
      flavorName:       cleanSurface(row, row.flavorName ?? null),
      flavorText:       row.flavorText ?? null,
      artist:           row.artist ?? null,
      watermark:        row.watermark ?? null,
      illustrationId:   row.illustrationId ?? null,
      attractionLights: row.attractionLights ?? null,
    };
  }
  return {
    typeLine:         f.type_line ?? null,
    printedName:      faceValue(f.printed_name, faceIndex),
    printedTypeLine:  faceValue(f.printed_type_line, faceIndex),
    printedText:      f.printed_text ?? null,
    flavorName:       f.flavor_name ?? null,
    flavorText:       f.flavor_text ?? null,
    artist:           f.artist ?? null,
    watermark:        f.watermark ?? null,
    illustrationId:   f.illustration_id ?? null,
    attractionLights: f.attraction_lights ?? null,
  };
}

/** Localized surface of exactly one face slot of a print row. */
function localizedFaceAt(row: CardRow, faceIndex: number): LocalizedFaceDraft {
  const faces = (row.cardFaces as RawFace[] | null) ?? [];
  const f = faces[faceIndex];
  if (f == null) {
    return {
      name:     cleanSurface(row, row.printedName ?? null),
      typeline: cleanSurface(row, row.printedTypeLine ?? null),
      text:     row.printedText ?? null,
    };
  }
  return {
    name:     cleanSurface(row, faceValue(f.printed_name, faceIndex)),
    typeline: cleanSurface(row, faceValue(f.printed_type_line, faceIndex)),
    text:     f.printed_text ?? null,
  };
}

/**
 * Normalize one MTGCH translation value for projection.
 *
 * The dataset escapes newlines as literal backslash sequences and never stores
 * a real newline; a missing translation is an empty string as well as NULL.
 * Two conventions are in use and both must reduce to a real newline: a doubled
 * backslash (zhs_card text on 30,988 rows, and every zhs_oracle text) and a
 * single one (zhs_card text on 127 rows plus one type line — the only place the
 * doublings are missing). The doubled form is reduced first so its backslashes
 * are consumed before the single form runs; otherwise the single form would eat
 * the inner backslash of a doubled escape and leave a stray one behind.
 */
export function normalizeMtgchText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value
    .replace(/\\\\r\\\\n/g, '\n')
    .replace(/\\\\r/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n');
  return text === '' ? null : text;
}

/** One MTGCH skeleton row (print position + face slot) joined with its zhs_card translation. */
interface MtgchPositionRow {
  faceIndex: number | null;
  faceName:  string | null;
  name:      string | null;
  typeLine:  string | null;
  text:      string | null;
}

/** MTGCH printed surfaces grouped by print position, keyed `set|number` (set lowercased). */
type MtgchPrintMap = Map<string, MtgchPositionRow[]>;

/**
 * Loads the MTGCH skeleton+zhs rows of the given oracles in one query.
 *
 * Keyed by oracle rather than by print position: the skeleton carries the
 * oracle id in scryfall's own id space, so one indexed lookup covers every
 * position a card can print at (including the reversible rows that contribute
 * prints to the card they reference) without the set/number cross product.
 */
export async function loadMtgchPrintMap(database: ProjectDb, oracleIds: string[]): Promise<MtgchPrintMap> {
  const ids = [...new Set(oracleIds.filter(id => id !== ''))];
  if (ids.length === 0) return new Map();
  const rows = await database
    .select({
      setCode:         MtgchScryfallCard.setCode,
      collectorNumber: MtgchScryfallCard.collectorNumber,
      faceIndex:       MtgchScryfallCard.faceIndex,
      faceName:        MtgchZhsCard.faceName,
      name:            MtgchZhsCard.name,
      typeLine:        MtgchZhsCard.typeLine,
      text:            MtgchZhsCard.text,
    })
    .from(MtgchScryfallCard)
    .innerJoin(MtgchZhsCard, eq(MtgchZhsCard.cardId, MtgchScryfallCard.cardId))
    .where(and(
      isNull(MtgchScryfallCard.deletedAt),
      isNull(MtgchZhsCard.deletedAt),
      inArray(MtgchScryfallCard.oracleId, ids),
    ));
  const map: MtgchPrintMap = new Map();
  for (const row of rows) {
    if (row.setCode == null || row.collectorNumber == null) continue;
    const key = `${row.setCode.toLowerCase()}|${row.collectorNumber}`;
    const list = map.get(key);
    const entry: MtgchPositionRow = { faceIndex: row.faceIndex, faceName: row.faceName, name: row.name, typeLine: row.typeLine, text: row.text };
    if (list == null) map.set(key, [entry]);
    else list.push(entry);
  }
  return map;
}

/** Whether the value carries content (non-empty after trim). */
function present(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

/** The localized face of one MTGCH row: the per-face name is authoritative, the whole-card name stands in. */
function mtgchFaceDraft(row: MtgchPositionRow): LocalizedFaceDraft {
  return {
    name:     normalizeMtgchText(present(row.faceName) ? row.faceName : row.name),
    typeline: normalizeMtgchText(row.typeLine),
    text:     normalizeMtgchText(row.text),
  };
}

/**
 * Resolves one print position's MTGCH faces for a draft with `faceCount` face
 * slots. Per-face skeleton rows feed normal multi-face cards (count must match
 * the slots) and split units (a specific `unitFaceIndex` picks its row); a
 * whole-card row serves single-face prints — meld rows carry the per-face name
 * in `face_name`, so the joined whole-card name never surfaces. Any other
 * combination means no community data: every slot stays null and the
 * projection keeps its English fallback.
 */
function resolveMtgchFaces(entries: MtgchPositionRow[] | undefined, faceCount: number, unitFaceIndex?: number): (LocalizedFaceDraft | null)[] | null {
  if (entries == null || entries.length === 0) return null;
  const faceRows = entries.filter(e => e.faceIndex != null && e.faceIndex >= 0);
  const wholeRow = entries.find(e => e.faceIndex == null || e.faceIndex < 0);
  let picked: (MtgchPositionRow | null)[] | null = null;
  if (unitFaceIndex != null) {
    const row = faceRows.find(e => e.faceIndex === unitFaceIndex);
    picked = row != null ? [row] : null;
  } else if (faceRows.length === faceCount) {
    picked = Array.from({ length: faceCount }, (_, i) => faceRows.find(e => e.faceIndex === i) ?? null);
  } else if (faceCount === 1 && wholeRow != null) {
    picked = [wholeRow];
  }
  if (picked == null) return null;
  const faces = picked.map(row => {
    if (row == null) return null;
    const face = mtgchFaceDraft(row);
    // A row whose every field is empty is an untranslated position, not data.
    return face.name == null && face.typeline == null && face.text == null ? null : face;
  });
  return faces.every(f => f == null) ? null : faces;
}

/** Attaches MTGCH printed faces to every zhs draft in place; other languages pass through untouched. */
function withMtgchFaces(map: MtgchPrintMap, drafts: PrintDraft[], unitFaceIndex?: number): void {
  for (const draft of drafts) {
    if (draft.lang !== 'zhs') continue;
    const faces = resolveMtgchFaces(map.get(`${draft.set.toLowerCase()}|${draft.number}`), draft.faces.length, unitFaceIndex);
    if (faces != null) draft.mtgchFaces = faces;
  }
}

/** One raw MTGCH oracle row, as stored in the cache. */
type MtgchRow = (typeof MtgchZhsOracle)['$inferSelect'];

/**
 * Order MTGCH rows so that row i belongs to oracle face i.
 *
 * The cache has no face-order column and holds one row per face in whatever
 * order the import wrote them, so position is not a reliable key: for
 * `Beluna's Gatekeeper // Entry Denied` the community rows arrive
 * adventure-first while the Scryfall faces are creature-first, and both rows
 * carry the same timestamp, so nothing distinguishes them. Each row does carry
 * the English face name, so faces are matched by name instead. If any row fails
 * to match a face, or two rows claim the same one, the rows keep their stored
 * order — the behaviour before name matching, and the only option left for the
 * few rows whose names do not line up.
 */
function alignMtgchFaces(rows: MtgchRow[], faces: OracleFaceDraft[]): MtgchRow[] {
  if (rows.length < 2) return rows;
  const indexByName = new Map(faces.map((face, i) => [face.name, i]));
  const ordered: (MtgchRow | undefined)[] = new Array(rows.length);
  for (const row of rows) {
    const index = row.name != null ? indexByName.get(row.name) : undefined;
    if (index == null || ordered[index] != null) return rows;
    ordered[index] = row;
  }
  return ordered as MtgchRow[];
}

/**
 * Reversible rows that reference `oracleId` become extra prints of that card.
 * A reversible physical object prints the referenced card on one or both of its
 * faces; each contributing face keeps a distinct print with the collector
 * number decorated by the face side ('a' for face 0, 'b' for face 1). The
 * reversible pool is static during a projection run, so `reversibleRows` lets
 * callers load it once instead of scanning per oracle.
 */
export async function loadReversibleRows(database: ProjectDb): Promise<CardRow[]> {
  return database.select().from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), eq(ScryfallCard.layout, 'reversible_card')));
}

/** Prints a card gains from reversible rows whose faces reference it. */
function reversiblePrintsFrom(rows: CardRow[], oracleId: string, mtgchMap?: MtgchPrintMap): PrintDraft[] {
  const out: PrintDraft[] = [];
  for (const row of rows) {
    const faces = (row.cardFaces as RawFace[] | null) ?? [];
    faces.forEach((f, i) => {
      if (f.oracle_id !== oracleId) return;
      const draft = toPrintDraft(row);
      // MTGCH positions use the raw collector number; attach before the face side suffix.
      if (mtgchMap != null && draft.lang === 'zhs') {
        const mtgchFaces = resolveMtgchFaces(mtgchMap.get(`${draft.set.toLowerCase()}|${draft.number}`), 1, i);
        if (mtgchFaces != null) draft.mtgchFaces = mtgchFaces;
      }
      draft.number = `${draft.number}${i === 0 ? 'a' : 'b'}`;
      draft.faces = [printFaceAt(row, i)];
      draft.scryfallFace = i === 0 ? 'front' : 'back';
      // Reversible rows carry no top-level oracle id; the print's identity is
      // the referenced face's oracle id (NOT NULL on the print table).
      draft.scryfallOracleId = f.oracle_id ?? oracleId;
      out.push(draft);
    });
  }
  return out;
}

/** Official localization surfaces (per non-English language, newest print). */
function officialSurfaces(allRows: CardRow[], faceIndex?: number): CardLocalizationSurface[] {
  const byLang = new Map<string, CardRow[]>();
  for (const r of allRows) {
    if (r.lang === 'en') continue;
    const list = byLang.get(r.lang) ?? [];
    list.push(r);
    byLang.set(r.lang, list);
  }
  const surfaces: CardLocalizationSurface[] = [];
  for (const [lang, rows] of byLang) {
    const latest = rows.sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1))[0]!;
    surfaces.push({
      locale:     lang,
      source:     '',
      faces:      faceIndex != null ? [localizedFaceAt(latest, faceIndex)] : localizedFaces(latest),
      provenance: { set: latest.set, number: latest.collectorNumber, releasedAt: latest.releasedAt },
    });
  }
  return surfaces;
}

/** Derive the cardId for an English row using the same rules as match. */
function cardIdFor(en: CardRow): string {
  const [unit] = toMatchUnits({
    oracleId:   en.oracleId ?? '',
    layout:     en.layout,
    name:       en.name,
    typeLine:   en.typeLine ?? '',
    oracleText: en.oracleText ?? null,
    colors:     en.colors ?? null,
    power:      en.power ?? null,
    toughness:  en.toughness ?? null,
    setName:    en.setName,
    cardFaces:  en.cardFaces,
  });
  if (unit == null) throw new Error(`assemble: cannot derive a unit for ${en.name}`);
  return slugifyCard(unit.card);
}

function toMatchRow(en: CardRow) {
  return {
    oracleId:   en.oracleId ?? '',
    layout:     en.layout,
    name:       en.name,
    typeLine:   en.typeLine ?? '',
    oracleText: en.oracleText ?? null,
    colors:     en.colors ?? null,
    power:      en.power ?? null,
    toughness:  en.toughness ?? null,
    setName:    en.setName,
    cardFaces:  en.cardFaces,
  };
}

/** English oracle cardIds per match unit of an English row. */
function unitSlugs(en: CardRow): string[] {
  return toMatchUnits(toMatchRow(en)).map(u => slugifyCard(u.card));
}

/**
 * Whether a front-face type line marks a battle card. Scryfall keeps battles
 * under the `transform` layout, but a battle's front is printed sideways, so
 * the projection gives its prints a dedicated layout for the UI to rotate.
 */
export function isBattleFront(typeLine: string | null | undefined): boolean {
  return typeLine?.includes('Battle') ?? false;
}

/**
 * Assemble every unit of one oracle id from magic_data into `AssembledCard`
 * snapshots. A normal (single/multi-face) oracle card is one unit; a
 * `double_faced_token` yields one unit per face. `reversible_card` produces no
 * units here (it only contributes prints to the units its faces reference).
 */
export async function assembleUnits(database: ProjectDb, oracleId: string, reversibleRows?: CardRow[]): Promise<AssembledCard[]> {
  const enRows = await database.select().from(ScryfallCard)
    .where(and(
      eq(ScryfallCard.lang, 'en'),
      eq(ScryfallCard.oracleId, oracleId),
      ne(ScryfallCard.layout, 'art_series'),
      ne(ScryfallCard.layout, 'front_card'),
    ))
    .orderBy(asc(ScryfallCard.set), asc(ScryfallCard.collectorNumber))
    .limit(1);

  const en = enRows[0];
  if (en == null) throw new Error(`assemble: no English row for oracle ${oracleId}`);

  if (en.layout === 'reversible_card') {
    throw new Error('assemble: reversible_card rows carry no unit; handle as prints to their faces');
  }

  // Hard-merged oracle pairs (B.F.M.): one card, two prints. The primary
  // member assembles the merged card; the secondary contributes no unit of
  // its own — its rows surface as prints under the primary's assembly.
  const mergeGroup = findCardMergeGroup(oracleId);
  if (mergeGroup != null) {
    if (oracleId !== mergeGroup.primaryOracleId) return [];
    const allRows = await database.select().from(ScryfallCard)
      .where(inArray(ScryfallCard.oracleId, mergeGroup.memberOracleIds))
      .orderBy(asc(ScryfallCard.set), asc(ScryfallCard.collectorNumber));
    const secondaryId = mergeGroup.memberOracleIds.find(id => id !== mergeGroup.primaryOracleId);
    const secondaryEn = allRows.find(r => r.lang === 'en' && r.oracleId === secondaryId);
    if (secondaryEn == null) throw new Error(`assemble: merge group ${mergeGroup.slug} has no secondary English row`);
    // The right half carries the merged card's mana cost and P/T; the type
    // line and rules text come from the group (the halves' lines misalign).
    const face = { ...oracleFaces(secondaryEn)[0]!, typeLine: mergeGroup.face.typeLine, oracleText: mergeGroup.face.oracleText };
    const mtgchMap = await loadMtgchPrintMap(database, mergeGroup.memberOracleIds);
    // Prints stay the raw halves: each keeps its own number, half rules text,
    // and half flavor text. The `combined` layout marks them as the two panels
    // of one spread; scryfallFace (the same field reversible prints use for
    // front/back) says which side each panel occupies.
    const prints = allRows.map(r => {
      const draft = toPrintDraft(r);
      draft.layout = 'combined';
      draft.scryfallFace = r.oracleId === mergeGroup.primaryOracleId ? 'left' : 'right';
      return draft;
    });
    withMtgchFaces(mtgchMap, prints);
    return [{
      unit:           mergeGroup.primaryOracleId,
      cardId:         mergeGroup.slug,
      oracleId:       mergeGroup.primaryOracleId,
      layout:         en.layout,
      setName:        en.setName,
      cmc:            secondaryEn.cmc ?? 0,
      colorIdentity:  en.colorIdentity,
      keywords:       en.keywords,
      producedMana:   en.producedMana ?? null,
      reserved:       en.reserved,
      contentWarning: en.contentWarning ?? null,
      legalities:     (en.legalities as Record<string, string>) ?? {},
      faces:          [face],
      localizations:  officialSurfaces(allRows),
      prints,
      // The folk zhs source also stores the two halves; no merged text exists.
      mtgch:          null,
    }];
  }

  const allRows = await database.select().from(ScryfallCard)
    .where(eq(ScryfallCard.oracleId, oracleId));

  const enFaces = oracleFaces(en);
  if (en.layout === 'double_faced_token' && isArtBackDoubleFacedToken(enFaces.map(f => f.name), enFaces)) {
    // Art-back token: the back is pure illustration, not a card part. Project as
    // a single-face card but keep the prints flippable (transform_token layout).
    const front = enFaces[0]!;
    const mtgchMap = await loadMtgchPrintMap(database, [oracleId]);
    const prints = allRows.map(r => {
      const draft = toPrintDraft(r);
      draft.layout = 'transform_token';
      draft.faces = [printFaceAt(r, 0)];
      return draft;
    });
    withMtgchFaces(mtgchMap, prints, 0);
    const localizations = officialSurfaces(allRows, 0);
    return [{
      unit:           oracleId,
      cardId:         cardIdFor(en),
      oracleId,
      layout:         'token',
      setName:        en.setName,
      cmc:            0,
      colorIdentity:  front.colors ?? [],
      keywords:       [],
      producedMana:   null,
      reserved:       false,
      contentWarning: null,
      legalities:     {},
      faces:          [front],
      localizations,
      prints,
      mtgch:          null,
    }];
  }
  if (en.layout === 'double_faced_token' && !isSingleCardDoubleFacedToken(enFaces.map(f => f.name))) {
    const faces = enFaces;
    const slugs = unitSlugs(en);
    const mtgchMap = await loadMtgchPrintMap(database, [oracleId]);
    const out: AssembledCard[] = [];
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i]!;
      const suffix = i === 0 ? 'a' : 'b';
      const prints = allRows.map(r => {
        const draft = toPrintDraft(r);
        draft.layout = 'token';
        // MTGCH face rows use the raw collector number; attach before the unit suffix.
        if (draft.lang === 'zhs') {
          const mtgchFaces = resolveMtgchFaces(mtgchMap.get(`${draft.set.toLowerCase()}|${draft.number}`), 1, i);
          if (mtgchFaces != null) draft.mtgchFaces = mtgchFaces;
        }
        draft.number = `${draft.number}${suffix}`;
        draft.faces = [printFaceAt(r, i)];
        return draft;
      });
      // Official localization provenance must point at the suffixed print rows.
      const localizations = officialSurfaces(allRows, i).map(s => s.provenance
        ? { ...s, provenance: { ...s.provenance, number: `${s.provenance.number}${suffix}` } }
        : s);
      out.push({
        unit:           `${oracleId}:${i}`,
        cardId:         slugs[i] ?? `${oracleId}-${i}`,
        oracleId,
        layout:         'token',
        setName:        en.setName,
        cmc:            0,
        colorIdentity:  face.colors ?? [],
        keywords:       [],
        producedMana:   null,
        reserved:       false,
        contentWarning: null,
        legalities:     {},
        faces:          [face],
        localizations,
        prints,
        mtgch:          null,
      });
    }
    return out;
  }

  // Normal single/multi-face oracle card: exactly one unit.
  const mtgchRows = await database.select().from(MtgchZhsOracle)
    .where(eq(MtgchZhsOracle.oracleId, oracleId));
  const faces = oracleFaces(en);
  // Both MTGCH values are normalized here (see normalizeMtgchText).
  const aligned = mtgchRows.length === faces.length && mtgchRows.length > 0
    ? alignMtgchFaces(mtgchRows, faces)
    : [];
  const mtgchFaces = aligned.length > 0
    ? aligned.map(r => ({
      name:     normalizeMtgchText(r.translatedName),
      typeline: normalizeMtgchText(r.translatedType),
      text:     normalizeMtgchText(r.translatedText),
    }))
    : null;

  const mtgchPrintMap = await loadMtgchPrintMap(database, [oracleId]);
  const baseDrafts = allRows.map(toPrintDraft);
  withMtgchFaces(mtgchPrintMap, baseDrafts);
  const prints = [
    ...baseDrafts,
    ...reversiblePrintsFrom(reversibleRows ?? await loadReversibleRows(database), oracleId, mtgchPrintMap),
  ];

  // Single double-sided tokens (Incubator//Phyrexian, Bounty//Wanted,
  // Day//Night, The Ring) stay one card; their prints flip like transform.
  if (en.layout === 'double_faced_token') {
    for (const p of prints) p.layout = 'transform_token';
  }

  // Battle cards keep Scryfall's transform layout, but a battle's front face is
  // printed sideways and the UI rotates it by layout; the legacy importer gave
  // them a dedicated layout for exactly this reason.
  if (isBattleFront(faces[0]?.typeLine)) {
    for (const p of prints) p.layout = 'battle';
  }

  return [{
    unit:           oracleId,
    cardId:         cardIdFor(en),
    oracleId,
    layout:         en.layout,
    setName:        en.setName,
    cmc:            en.cmc ?? 0,
    colorIdentity:  en.colorIdentity,
    keywords:       en.keywords,
    producedMana:   en.producedMana ?? null,
    reserved:       en.reserved,
    contentWarning: en.contentWarning ?? null,
    legalities:     (en.legalities as Record<string, string>) ?? {},
    faces,
    localizations:  officialSurfaces(allRows),
    prints,
    mtgch:          mtgchFaces != null ? { faces: mtgchFaces } : null,
  }];
}

/** Convenience: assemble the first (or only) unit of an oracle id. */
export async function assembleCard(database: ProjectDb, oracleId: string): Promise<AssembledCard> {
  return (await assembleUnits(database, oracleId))[0]!;
}
