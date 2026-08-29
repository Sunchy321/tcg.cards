import { db } from '@tcg-cards/db/db';
import { ScryfallCard, ScryfallSet, ScryfallRuling } from '@tcg-cards/db/schema/local/magic';
import type { RawCard, RawRuling } from '@tcg-cards/model/magic/schema/data/scryfall/card';
import type { RawSet } from '@tcg-cards/model/magic/schema/data/scryfall/set';

import { readJsonl } from '../jsonl';
import { softDeleteMissing, upsertBatch, type ImportCounts } from '../upsert';

const BATCH = 1000;

function toCardRow(raw: RawCard): typeof ScryfallCard.$inferInsert {
  return {
    cardId:            raw.id,
    oracleId:          raw.oracle_id,
    lang:              raw.lang,
    arenaId:           raw.arena_id ?? null,
    mtgoId:            raw.mtgo_id ?? null,
    mtgoFoilId:        raw.mtgo_foil_id ?? null,
    multiverseIds:     raw.multiverse_ids ?? [],
    tcgplayerId:       raw.tcgplayer_id ?? null,
    tcgplayerEtchedId: raw.tcgplayer_etched_id ?? null,
    cardmarketId:      raw.cardmarket_id ?? null,
    printsSearchUri:   raw.prints_search_uri ?? null,
    rulingsUri:        raw.rulings_uri ?? null,
    scryfallUri:       raw.scryfall_uri ?? null,
    uri:               raw.uri ?? null,
    layout:            raw.layout,
    name:              raw.name,
    oracleText:        raw.oracle_text ?? null,
    typeLine:          raw.type_line,
    manaCost:          raw.mana_cost ?? null,
    cmc:               raw.cmc,
    colors:            raw.colors ?? null,
    colorIdentity:     raw.color_identity,
    colorIndicator:    raw.color_indicator ?? null,
    keywords:          raw.keywords,
    producedMana:      raw.produced_mana ?? null,
    legalities:        raw.legalities as Record<string, string>,
    power:             raw.power ?? null,
    toughness:         raw.toughness ?? null,
    loyalty:           raw.loyalty ?? null,
    defense:           raw.defense ?? null,
    handModifier:      raw.hand_modifier ?? null,
    lifeModifier:      raw.life_modifier ?? null,
    reserved:          raw.reserved,
    oversized:         raw.oversized,
    gameChanger:       raw.game_changer,
    contentWarning:    raw.content_warning ?? null,
    edhrecRank:        raw.edhrec_rank ?? null,
    pennyRank:         raw.penny_rank ?? null,
    allParts:          raw.all_parts ?? null,
    cardFaces:         raw.card_faces ?? null,
    resourceId:        raw.resource_id ?? null,
    set:               raw.set,
    setId:             raw.set_id,
    setName:           raw.set_name,
    setType:           raw.set_type,
    setUri:            raw.set_uri ?? null,
    setSearchUri:      raw.set_search_uri ?? null,
    scryfallSetUri:    raw.scryfall_set_uri ?? null,
    collectorNumber:   raw.collector_number,
    rarity:            raw.rarity,
    releasedAt:        raw.released_at,
    frame:             raw.frame,
    frameEffects:      raw.frame_effects ?? null,
    borderColor:       raw.border_color,
    cardBackId:        raw.card_back_id ?? null,
    artist:            raw.artist ?? null,
    artistIds:         raw.artist_ids ?? null,
    flavorText:        raw.flavor_text ?? null,
    flavorName:        raw.flavor_name ?? null,
    illustrationId:    raw.illustration_id ?? null,
    imageUris:         raw.image_uris ?? null,
    imageStatus:       raw.image_status,
    imageUpdatedAt:    (raw as any).image_updated_at ?? null,
    highresImage:      raw.highres_image,
    finishes:          raw.finishes,
    games:             raw.games,
    booster:           raw.booster,
    promo:             raw.promo,
    promoTypes:        raw.promo_types ?? null,
    fullArt:           raw.full_art,
    textless:          raw.textless,
    storySpotlight:    raw.story_spotlight,
    reprint:           raw.reprint,
    digital:           raw.digital,
    variation:         raw.variation,
    variationOf:       raw.variation_of ?? null,
    securityStamp:     raw.security_stamp ?? null,
    watermark:         raw.watermark ?? null,
    attractionLights:  raw.attraction_lights ?? null,
    printedName:       raw.printed_name ?? null,
    printedText:       raw.printed_text ?? null,
    printedTypeLine:   raw.printed_type_line ?? null,
    preview:           raw.preview ?? null,
    prices:            raw.prices ?? null,
    purchaseUris:      raw.purchase_uris ?? null,
    relatedUris:       raw.related_uris ?? null,
  };
}

function toSetRow(raw: RawSet): typeof ScryfallSet.$inferInsert {
  return {
    setId:         raw.id,
    code:          raw.code,
    mtgoCode:      raw.mtgo_code ?? null,
    arenaCode:     (raw as any).arena_code ?? null,
    tcgplayerId:   raw.tcgplayer_id ?? null,
    name:          raw.name,
    setType:       raw.set_type,
    releasedAt:    raw.released_at ?? null,
    blockCode:     raw.block_code ?? null,
    block:         raw.block ?? null,
    parentSetCode: raw.parent_set_code ?? null,
    cardCount:     raw.card_count,
    printedSize:   raw.printed_size ?? null,
    digital:       raw.digital,
    foilOnly:      raw.foil_only,
    nonfoilOnly:   raw.nonfoil_only,
    scryfallUri:   raw.scryfall_uri,
    uri:           raw.uri,
    iconSvgUri:    raw.icon_svg_uri,
    searchUri:     raw.search_uri,
  };
}

function toRulingRow(raw: RawRuling): typeof ScryfallRuling.$inferInsert {
  return {
    oracleId:    raw.oracle_id,
    source:      raw.source,
    publishedAt: raw.published_at,
    comment:     raw.comment,
  };
}

/** Imports a Scryfall card bulk file into magic_data.scryfall_cards. Returns the import report. */
export async function importScryfallCards(file: string): Promise<ImportCounts> {
  const imported = new Set<string>();
  const counts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0, deleted: 0 };
  let batch: typeof ScryfallCard.$inferInsert[] = [];
  for await (const obj of readJsonl(file)) {
    if (obj.object !== 'card') continue;
    const row = toCardRow(obj as unknown as RawCard);
    imported.add(String(row.cardId));
    batch.push(row);
    if (batch.length >= BATCH) {
      const result = await upsertBatch(db, ScryfallCard, batch, ScryfallCard.cardId, ['cardId']);
      counts.inserted += result.inserted;
      counts.updated += result.updated;
      counts.unchanged += result.unchanged;
      batch = [];
    }
  }
  if (batch.length) {
    const result = await upsertBatch(db, ScryfallCard, batch, ScryfallCard.cardId, ['cardId']);
    counts.inserted += result.inserted;
    counts.updated += result.updated;
    counts.unchanged += result.unchanged;
  }
  counts.deleted = await softDeleteMissing(db, ScryfallCard, [ScryfallCard.cardId], ['cardId'], imported);
  return counts;
}

/** Imports a Scryfall set bulk file into magic_data.scryfall_sets. Returns the import report. */
export async function importScryfallSets(file: string): Promise<ImportCounts> {
  const imported = new Set<string>();
  const counts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0, deleted: 0 };
  let batch: typeof ScryfallSet.$inferInsert[] = [];
  for await (const obj of readJsonl(file)) {
    if (obj.object !== 'set') continue;
    const row = toSetRow(obj as unknown as RawSet);
    imported.add(String(row.setId));
    batch.push(row);
    if (batch.length >= BATCH) {
      const result = await upsertBatch(db, ScryfallSet, batch, ScryfallSet.setId, ['setId']);
      counts.inserted += result.inserted;
      counts.updated += result.updated;
      counts.unchanged += result.unchanged;
      batch = [];
    }
  }
  if (batch.length) {
    const result = await upsertBatch(db, ScryfallSet, batch, ScryfallSet.setId, ['setId']);
    counts.inserted += result.inserted;
    counts.updated += result.updated;
    counts.unchanged += result.unchanged;
  }
  counts.deleted = await softDeleteMissing(db, ScryfallSet, [ScryfallSet.setId], ['setId'], imported);
  return counts;
}

/** Imports a Scryfall rulings bulk file into magic_data.scryfall_rulings. Returns the import report. */
export async function importScryfallRulings(file: string): Promise<ImportCounts> {
  const imported = new Set<string>();
  const counts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0, deleted: 0 };
  let batch: typeof ScryfallRuling.$inferInsert[] = [];
  for await (const obj of readJsonl(file)) {
    if (obj.object !== 'ruling') continue;
    const row = toRulingRow(obj as unknown as RawRuling);
    imported.add(String(row.id));
    batch.push(row);
    if (batch.length >= BATCH) {
      const result = await upsertBatch(db, ScryfallRuling, batch, ScryfallRuling.id, ['id']);
      counts.inserted += result.inserted;
      counts.updated += result.updated;
      counts.unchanged += result.unchanged;
      batch = [];
    }
  }
  if (batch.length) {
    const result = await upsertBatch(db, ScryfallRuling, batch, ScryfallRuling.id, ['id']);
    counts.inserted += result.inserted;
    counts.updated += result.updated;
    counts.unchanged += result.unchanged;
  }
  counts.deleted = await softDeleteMissing(db, ScryfallRuling, [ScryfallRuling.id], ['id'], imported);
  return counts;
}

const emptyCounts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0, deleted: 0 };

/** Imports Scryfall bulk files into the magic_data scryfall caches. */
export async function importScryfallBulk(
  paths: { cards?: string, sets?: string, rulings?: string },
): Promise<{ cards: ImportCounts, sets: ImportCounts, rulings: ImportCounts }> {
  return {
    cards:   paths.cards ? await importScryfallCards(paths.cards) : emptyCounts,
    sets:    paths.sets ? await importScryfallSets(paths.sets) : emptyCounts,
    rulings: paths.rulings ? await importScryfallRulings(paths.rulings) : emptyCounts,
  };
}
