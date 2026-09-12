import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { dataSchema } from '../../../shared/magic/schema';

/**
 * Raw Scryfall card object cache. One row per Scryfall card (all-cards bulk),
 * holding every documented field of the card object so re-projection never
 * needs to re-fetch the bulk file. `cardId` is the Scryfall card `id`.
 */
export const ScryfallCard = dataSchema.table('scryfall_cards', {
  cardId:   uuid('card_id').primaryKey(),
  // Reversible cards carry a null top-level oracle_id; the identity lives on the
  // faces, so the cache keeps the raw null and projection resolves it from faces.
  oracleId: uuid('oracle_id'),
  lang:     text('lang').notNull(),

  // core
  arenaId:           integer('arena_id'),
  mtgoId:            integer('mtgo_id'),
  mtgoFoilId:        integer('mtgo_foil_id'),
  multiverseIds:     integer('multiverse_ids').array().notNull(),
  tcgplayerId:       integer('tcgplayer_id'),
  tcgplayerEtchedId: integer('tcgplayer_etched_id'),
  cardmarketId:      integer('cardmarket_id'),
  printsSearchUri:   text('prints_search_uri'),
  rulingsUri:        text('rulings_uri'),
  scryfallUri:       text('scryfall_uri'),
  uri:               text('uri'),

  // gameplay
  layout:         text('layout').notNull(),
  name:           text('name').notNull(),
  oracleText:     text('oracle_text'),
  // Reversible cards also leave type_line and cmc null at the top level; the raw
  // null is stored and the projection falls back to the face values.
  typeLine:       text('type_line'),
  manaCost:       text('mana_cost'),
  cmc:            doublePrecision('cmc'),
  colors:         text('colors').array(),
  colorIdentity:  text('color_identity').array().notNull(),
  colorIndicator: text('color_indicator').array(),
  keywords:       text('keywords').array().notNull(),
  producedMana:   text('produced_mana').array(),
  legalities:     jsonb('legalities').$type<Record<string, string>>().notNull(),
  power:          text('power'),
  toughness:      text('toughness'),
  loyalty:        text('loyalty'),
  defense:        text('defense'),
  handModifier:   text('hand_modifier'),
  lifeModifier:   text('life_modifier'),
  reserved:       boolean('reserved').notNull(),
  oversized:      boolean('oversized').notNull(),
  gameChanger:    boolean('game_changer').notNull(),
  contentWarning: boolean('content_warning'),
  edhrecRank:     integer('edhrec_rank'),
  pennyRank:      integer('penny_rank'),
  allParts:       jsonb('all_parts').$type<unknown[]>(),
  cardFaces:      jsonb('card_faces').$type<unknown[]>(),
  resourceId:     text('resource_id'),

  // print
  set:              text('set').notNull(),
  setId:            uuid('set_id').notNull(),
  setName:          text('set_name').notNull(),
  setType:          text('set_type').notNull(),
  setUri:           text('set_uri'),
  setSearchUri:     text('set_search_uri'),
  scryfallSetUri:   text('scryfall_set_uri'),
  collectorNumber:  text('collector_number').notNull(),
  rarity:           text('rarity').notNull(),
  releasedAt:       text('released_at').notNull(),
  frame:            text('frame').notNull(),
  frameEffects:     text('frame_effects').array(),
  borderColor:      text('border_color').notNull(),
  cardBackId:       uuid('card_back_id'),
  artist:           text('artist'),
  artistIds:        uuid('artist_ids').array(),
  flavorText:       text('flavor_text'),
  flavorName:       text('flavor_name'),
  illustrationId:   uuid('illustration_id'),
  imageUris:        jsonb('image_uris').$type<Record<string, string>>(),
  imageStatus:      text('image_status').notNull(),
  imageUpdatedAt:   text('image_updated_at'),
  highresImage:     boolean('highres_image').notNull(),
  finishes:         text('finishes').array().notNull(),
  games:            text('games').array().notNull(),
  booster:          boolean('booster').notNull(),
  promo:            boolean('promo').notNull(),
  promoTypes:       text('promo_types').array(),
  fullArt:          boolean('full_art').notNull(),
  textless:         boolean('textless').notNull(),
  storySpotlight:   boolean('story_spotlight').notNull(),
  reprint:          boolean('reprint').notNull(),
  digital:          boolean('digital').notNull(),
  variation:        boolean('variation').notNull(),
  variationOf:      uuid('variation_of'),
  securityStamp:    text('security_stamp'),
  watermark:        text('watermark'),
  attractionLights: integer('attraction_lights').array(),
  printedName:      text('printed_name'),
  printedText:      text('printed_text'),
  printedTypeLine:  text('printed_type_line'),
  preview:          jsonb('preview').$type<unknown>(),
  prices:           jsonb('prices').$type<Record<string, string | null>>(),
  purchaseUris:     jsonb('purchase_uris').$type<Record<string, string>>(),
  relatedUris:      jsonb('related_uris').$type<Record<string, string>>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, table => [
  index('scryfall_cards_oracle_id_idx').on(table.oracleId),
]);

/**
 * Raw Scryfall set object cache. One row per Scryfall set, holding every
 * documented field of the set object. `setId` is the Scryfall set `id`.
 */
export const ScryfallSet = dataSchema.table('scryfall_sets', {
  setId:         uuid('id').primaryKey(),
  code:          text('code').notNull(),
  mtgoCode:      text('mtgo_code'),
  arenaCode:     text('arena_code'),
  tcgplayerId:   integer('tcgplayer_id'),
  name:          text('name').notNull(),
  setType:       text('set_type').notNull(),
  releasedAt:    text('released_at'),
  blockCode:     text('block_code'),
  block:         text('block'),
  parentSetCode: text('parent_set_code'),
  cardCount:     integer('card_count').notNull(),
  printedSize:   integer('printed_size'),
  digital:       boolean('digital').notNull(),
  foilOnly:      boolean('foil_only').notNull(),
  nonfoilOnly:   boolean('nonfoil_only').notNull(),
  scryfallUri:   text('scryfall_uri'),
  uri:           text('uri'),
  iconSvgUri:    text('icon_svg_uri'),
  searchUri:     text('search_uri'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
});

/**
 * Raw Scryfall ruling cache. One row per ruling; rulings carry no stable id,
 * so a generated uuid is used. Queried by oracle_id.
 */
export const ScryfallRuling = dataSchema.table('scryfall_rulings', {
  id:          uuid('id').primaryKey().defaultRandom(),
  oracleId:    uuid('oracle_id').notNull(),
  source:      text('source').notNull(),
  publishedAt: text('published_at').notNull(),
  comment:     text('comment').notNull(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, table => [
  index('scryfall_rulings_oracle_id_idx').on(table.oracleId),
]);
