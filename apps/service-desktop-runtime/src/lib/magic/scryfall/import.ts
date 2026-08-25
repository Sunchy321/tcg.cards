import { db } from '@tcg-cards/db/db';
import { ScryfallCard, ScryfallSet, ScryfallRuling } from '@tcg-cards/db/schema/local/magic';
import type { RawCard, RawRuling } from '@tcg-cards/model/magic/schema/data/scryfall/card';
import type { RawSet } from '@tcg-cards/model/magic/schema/data/scryfall/set';

import { readJsonl } from '../jsonl';

const BATCH = 1000;
const CACHE_MS = 30 * 24 * 3600 * 1000;

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
    expiresAt:         new Date(Date.now() + CACHE_MS),
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
    expiresAt:     new Date(Date.now() + CACHE_MS),
  };
}

function toRulingRow(raw: RawRuling): typeof ScryfallRuling.$inferInsert {
  return {
    oracleId:    raw.oracle_id,
    source:      raw.source,
    publishedAt: raw.published_at,
    comment:     raw.comment,
    expiresAt:   new Date(Date.now() + CACHE_MS),
  };
}

/** Imports a Scryfall card bulk file into magic_data.scryfall_cards. Returns rows inserted. */
export async function importScryfallCards(file: string): Promise<number> {
  let count = 0;
  let batch: typeof ScryfallCard.$inferInsert[] = [];
  for await (const obj of readJsonl(file)) {
    if (obj.object !== 'card') continue;
    batch.push(toCardRow(obj as unknown as RawCard));
    if (batch.length >= BATCH) {
      await db.insert(ScryfallCard).values(batch).onConflictDoNothing();
      count += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await db.insert(ScryfallCard).values(batch).onConflictDoNothing();
    count += batch.length;
  }
  return count;
}

/** Imports a Scryfall set bulk file into magic_data.scryfall_sets. Returns rows inserted. */
export async function importScryfallSets(file: string): Promise<number> {
  let count = 0;
  let batch: typeof ScryfallSet.$inferInsert[] = [];
  for await (const obj of readJsonl(file)) {
    if (obj.object !== 'set') continue;
    batch.push(toSetRow(obj as unknown as RawSet));
    if (batch.length >= BATCH) {
      await db.insert(ScryfallSet).values(batch).onConflictDoNothing();
      count += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await db.insert(ScryfallSet).values(batch).onConflictDoNothing();
    count += batch.length;
  }
  return count;
}

/** Imports a Scryfall rulings bulk file into magic_data.scryfall_rulings. Returns rows inserted. */
export async function importScryfallRulings(file: string): Promise<number> {
  let count = 0;
  let batch: typeof ScryfallRuling.$inferInsert[] = [];
  for await (const obj of readJsonl(file)) {
    if (obj.object !== 'ruling') continue;
    batch.push(toRulingRow(obj as unknown as RawRuling));
    if (batch.length >= BATCH) {
      await db.insert(ScryfallRuling).values(batch).onConflictDoNothing();
      count += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await db.insert(ScryfallRuling).values(batch).onConflictDoNothing();
    count += batch.length;
  }
  return count;
}

/** Imports Scryfall bulk files into the magic_data scryfall caches. */
export async function importScryfallBulk(
  paths: { cards?: string, sets?: string, rulings?: string },
): Promise<{ cards: number, sets: number, rulings: number }> {
  return {
    cards:   paths.cards ? await importScryfallCards(paths.cards) : 0,
    sets:    paths.sets ? await importScryfallSets(paths.sets) : 0,
    rulings: paths.rulings ? await importScryfallRulings(paths.rulings) : 0,
  };
}
