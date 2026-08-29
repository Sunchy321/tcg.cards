import { boolean, integer, jsonb, text, timestamp } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../../shared/magic/schema';

/**
 * Raw MTGJSON set cache. One row per set (per-set JSON file `{ meta, data: Set }`).
 * Set-level scalar fields are columns; the full Set object (cards[], tokens[],
 * booster, sealedProduct[], decks[]) is kept in `data` for projection.
 * `setId` is the MTGJSON set `code`.
 */
export const MtgjsonSet = dataSchema.table('mtgjson_sets', {
  setId:            text('set_id').primaryKey(),
  name:             text('name').notNull(),
  type:             text('type').notNull(),
  baseSetSize:      integer('base_set_size').notNull(),
  totalSetSize:     integer('total_set_size').notNull(),
  releaseDate:      text('release_date').notNull(),
  isFoilOnly:       boolean('is_foil_only').notNull(),
  isNonFoilOnly:    boolean('is_non_foil_only'),
  isOnlineOnly:     boolean('is_online_only').notNull(),
  isPaperOnly:      boolean('is_paper_only'),
  isForeignOnly:    boolean('is_foreign_only'),
  isPartialPreview: boolean('is_partial_preview'),
  keyruneCode:      text('keyrune_code').notNull(),
  block:            text('block'),
  parentCode:       text('parent_code'),
  mtgoCode:         text('mtgo_code'),
  mcmId:            integer('mcm_id'),
  mcmIdExtras:      integer('mcm_id_extras'),
  mcmName:          text('mcm_name'),
  cardsphereSetId:  integer('cardsphere_set_id'),
  tcgplayerGroupId: integer('tcgplayer_group_id'),
  tokenSetCode:     text('token_set_code'),
  languages:        text('languages').array(),
  translations:     jsonb('translations').$type<Record<string, string>>(),
  data:             jsonb('data').$type<unknown>().notNull(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
});
