import { integer, jsonb, primaryKey, text } from 'drizzle-orm/pg-core';
import { dataSchema } from '../../shared/hearthstone/schema';

/**
 * Card data extracted from the Hearthstone Unity dbf.unity3d CARD table.
 * One row per card per build version. Contains fields not available in the
 * hsdata XML source (e.g. textBuilderType, event IDs, suggestion weight).
 */
export const UnpackCardData = dataSchema.table('unpack_card_data', {
  buildNumber: integer('build_number').notNull(),
  cardId:      text('card_id').notNull(),

  // --- Scalar fields (not in hsdata) ---
  dbfId:                    integer('dbf_id').notNull(),
  textBuilderType:          integer('text_builder_type').notNull().default(0),
  artistName:               text('artist_name'),
  signatureArtistName:      text('signature_artist_name'),
  creditsCardName:          text('credits_card_name'),
  watermarkTextureOverride: text('watermark_texture_override'),
  suggestionWeight:         integer('suggestion_weight').notNull().default(0),
  changeVersion:            integer('change_version').notNull().default(0),

  // --- Event references ---
  gameplayEvent:                 integer('gameplay_event'),
  craftingEvent:                 integer('crafting_event'),
  goldenCraftingEvent:           integer('golden_crafting_event'),
  signatureCraftingEvent:        integer('signature_crafting_event'),
  diamondCraftingEvent:          integer('diamond_crafting_event'),
  featuredCardsEvent:            integer('featured_cards_event'),
  battlegroundsActiveEvent:      integer('battlegrounds_active_event'),
  battlegroundsEarlyAccessEvent: integer('battlegrounds_early_access_event'),
  battlegroundsEveryGameEvent:   integer('battlegrounds_every_game_event'),

  // --- LocString fields (mirror hsdata localization, stored as raw JSONB) ---
  name:                  jsonb('name'),
  textInHand:            jsonb('text_in_hand'),
  flavorText:            jsonb('flavor_text'),
  howToGetCard:          jsonb('how_to_get_card'),
  howToGetGoldCard:      jsonb('how_to_get_gold_card'),
  howToGetSignatureCard: jsonb('how_to_get_signature_card'),
  howToGetDiamondCard:   jsonb('how_to_get_diamond_card'),
  targetArrowText:       jsonb('target_arrow_text'),
  shortName:             jsonb('short_name'),
}, table => [
  primaryKey({ columns: [table.buildNumber, table.cardId] }),
]);
