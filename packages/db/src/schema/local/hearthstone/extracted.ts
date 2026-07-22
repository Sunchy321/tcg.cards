import { boolean, index, integer, jsonb, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { dataSchema } from '../../shared/hearthstone/schema';

interface LocString {
  m_locValues: string[];
  m_locId:     number;
}

/**
 * Card data extracted from the Hearthstone Unity dbf.unity3d CARD table.
 * One row per unique card snapshot. Multiple builds sharing the same card data
 * are merged via buildNumbers. Cross-build dedup is driven by snapshotHash.
 */
export const ExtractedCard = dataSchema.table('extracted_card', {
  id:           uuid('id').primaryKey().defaultRandom(),
  cardId:       text('card_id').notNull(),
  dbfId:        integer('dbf_id').notNull(),
  buildNumbers: integer('build_numbers').array().notNull(),
  snapshotHash: text('snapshot_hash').notNull(),

  // --- Scalar fields (not in hsdata) ---
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
  name:                  jsonb('name').$type<LocString>(),
  textInHand:            jsonb('text_in_hand').$type<LocString>(),
  flavorText:            jsonb('flavor_text').$type<LocString>(),
  howToGetCard:          jsonb('how_to_get_card').$type<LocString>(),
  howToGetGoldCard:      jsonb('how_to_get_gold_card').$type<LocString>(),
  howToGetSignatureCard: jsonb('how_to_get_signature_card').$type<LocString>(),
  howToGetDiamondCard:   jsonb('how_to_get_diamond_card').$type<LocString>(),
  targetArrowText:       jsonb('target_arrow_text').$type<LocString>(),
  shortName:             jsonb('short_name').$type<LocString>(),

  projectionState: text('projection_state').notNull().default('not_projected'),
}, table => [
  uniqueIndex('extracted_card_card_hash_uq').on(table.cardId, table.snapshotHash),
  index('extracted_card_card_id_idx').on(table.cardId),
  index('extracted_card_build_numbers_gin_idx').using('gin', table.buildNumbers),
  index('extracted_card_projection_state_idx').on(table.projectionState).where(sql`${table.projectionState} != 'projected'`),
]);

/**
 * Card tag data extracted from the Hearthstone Unity dbf.unity3d CARD_TAG table.
 * One row per tag per card snapshot. Child of ExtractedCard via snapshotId.
 */
export const ExtractedCardTag = dataSchema.table('extracted_card_tags', {
  snapshotId:        uuid('snapshot_id').notNull().references(() => ExtractedCard.id, { onDelete: 'cascade' }),
  dbfId:             integer('dbf_id').notNull(),
  tagId:             integer('tag_id').notNull(),
  tagValue:          integer('tag_value').notNull(),
  isReferenceTag:    boolean('is_reference_tag').notNull(),
  isPowerKeywordTag: boolean('is_power_keyword_tag').notNull(),
}, table => [
  primaryKey({ columns: [table.snapshotId, table.tagId] }),
  index('extracted_card_tags_dbf_id_idx').on(table.dbfId),
]);
