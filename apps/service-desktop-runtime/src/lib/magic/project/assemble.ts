import { and, asc, eq, ne } from 'drizzle-orm';

import type { createDb } from '@tcg-cards/db';
import { MtgchZhsOracle, ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { slugifyCard, toMatchUnits } from '../match';

import type { AssembledCard, CardLocalizationSurface, LocalizedFaceDraft, OracleFaceDraft, PrintDraft, PrintFaceDraft } from './project-card';

type CardRow = (typeof ScryfallCard)['$inferSelect'];

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

/** Faces of a print, aligned to the card's oracle faces. */
function printFaces(row: CardRow): PrintFaceDraft[] {
  const faces = (row.cardFaces as RawFace[] | null) ?? [];
  if (faces.length === 0) {
    return [{
      typeLine:         row.typeLine ?? null,
      printedName:      row.printedName ?? null,
      printedTypeLine:  row.printedTypeLine ?? null,
      printedText:      row.printedText ?? null,
      flavorName:       row.flavorName ?? null,
      flavorText:       row.flavorText ?? null,
      artist:           row.artist ?? null,
      watermark:        row.watermark ?? null,
      illustrationId:   row.illustrationId ?? null,
      attractionLights: row.attractionLights ?? null,
    }];
  }
  return faces.map(f => ({
    typeLine:         f.type_line ?? null,
    printedName:      f.printed_name ?? null,
    printedTypeLine:  f.printed_type_line ?? null,
    printedText:      f.printed_text ?? null,
    flavorName:       f.flavor_name ?? null,
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
    hasHighResImage:   row.highresImage,
    imageStatus:       row.imageStatus,
    imageUpdatedAt:    row.imageUpdatedAt,
    fullImageType:     'jpg',
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
    scryfallImageUris: row.imageUris != null ? [row.imageUris] : null,
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
      name:     row.printedName ?? null,
      typeline: row.printedTypeLine ?? null,
      text:     row.printedText ?? null,
    }];
  }
  return faces.map(f => ({
    name:     f.printed_name ?? null,
    typeline: f.printed_type_line ?? null,
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
      printedName:      row.printedName ?? null,
      printedTypeLine:  row.printedTypeLine ?? null,
      printedText:      row.printedText ?? null,
      flavorName:       row.flavorName ?? null,
      flavorText:       row.flavorText ?? null,
      artist:           row.artist ?? null,
      watermark:        row.watermark ?? null,
      illustrationId:   row.illustrationId ?? null,
      attractionLights: row.attractionLights ?? null,
    };
  }
  return {
    typeLine:         f.type_line ?? null,
    printedName:      f.printed_name ?? null,
    printedTypeLine:  f.printed_type_line ?? null,
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
      name:     row.printedName ?? null,
      typeline: row.printedTypeLine ?? null,
      text:     row.printedText ?? null,
    };
  }
  return {
    name:     f.printed_name ?? null,
    typeline: f.printed_type_line ?? null,
    text:     f.printed_text ?? null,
  };
}

/**
 * Reversible rows that reference `oracleId` become extra prints of that card.
 * A reversible physical object prints the referenced card on one or both of its
 * faces; each contributing face keeps a distinct print with the collector
 * number decorated by the face side ('a' for face 0, 'b' for face 1).
 */
async function reversiblePrintsFor(database: ProjectDb, oracleId: string): Promise<PrintDraft[]> {
  const rows = await database.select().from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), eq(ScryfallCard.layout, 'reversible_card')));

  const out: PrintDraft[] = [];
  for (const row of rows) {
    const faces = (row.cardFaces as RawFace[] | null) ?? [];
    faces.forEach((f, i) => {
      if (f.oracle_id !== oracleId) return;
      const draft = toPrintDraft(row);
      draft.number = `${draft.number}${i === 0 ? 'a' : 'b'}`;
      draft.faces = [printFaceAt(row, i)];
      draft.scryfallFace = i === 0 ? 'front' : 'back';
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
 * Assemble every unit of one oracle id from magic_data into `AssembledCard`
 * snapshots. A normal (single/multi-face) oracle card is one unit; a
 * `double_faced_token` yields one unit per face. `reversible_card` produces no
 * units here (it only contributes prints to the units its faces reference).
 */
export async function assembleUnits(database: ProjectDb, oracleId: string): Promise<AssembledCard[]> {
  const enRows = await database.select().from(ScryfallCard)
    .where(and(
      eq(ScryfallCard.lang, 'en'),
      eq(ScryfallCard.oracleId, oracleId),
      ne(ScryfallCard.layout, 'art_series'),
    ))
    .orderBy(asc(ScryfallCard.set), asc(ScryfallCard.collectorNumber))
    .limit(1);

  const en = enRows[0];
  if (en == null) throw new Error(`assemble: no English row for oracle ${oracleId}`);

  if (en.layout === 'reversible_card') {
    throw new Error('assemble: reversible_card rows carry no unit; handle as prints to their faces');
  }

  const allRows = await database.select().from(ScryfallCard)
    .where(eq(ScryfallCard.oracleId, oracleId));

  if (en.layout === 'double_faced_token') {
    const faces = oracleFaces(en);
    const slugs = unitSlugs(en);
    const out: AssembledCard[] = [];
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i]!;
      const prints = allRows.map(r => {
        const draft = toPrintDraft(r);
        draft.faces = [printFaceAt(r, i)];
        return draft;
      });
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
        localizations:  officialSurfaces(allRows, i),
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
  const mtgchFaces = mtgchRows.length === faces.length && mtgchRows.length > 0
    ? mtgchRows.map(r => ({
      name:     r.translatedName ?? null,
      typeline: r.translatedType ?? null,
      text:     r.translatedText ?? null,
    }))
    : null;

  const prints = [
    ...allRows.map(toPrintDraft),
    ...(await reversiblePrintsFor(database, oracleId)),
  ];

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
