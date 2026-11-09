import { bigint, boolean, integer, jsonb, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { schema } from './schema';

import { locale } from './card';
import type { Booster as BoosterModel } from '@tcg-cards/model/magic/schema/set';

export const SetLocalization = schema.table('set_localizations', {
  setId: text('set_id').notNull(),
  lang:  text('lang').notNull(),

  name: text('name'),
  link: text('url'),
}, table => [
  primaryKey({ columns: [table.setId, table.lang] }),
]);

/** One booster product with its complete, exportable pack and sheet composition. */
export const Booster = schema.table('boosters', {
  setId:       text('set_id').notNull(),
  boosterId:   text('booster_id').notNull(),
  totalWeight: bigint('total_weight', { mode: 'number' }).notNull().default(0),
  packs:       jsonb('packs').$type<BoosterModel['packs']>().notNull().default([]),
  sheets:      jsonb('sheets').$type<BoosterModel['sheets']>().notNull().default([]),
}, table => [
  primaryKey({ columns: [table.setId, table.boosterId] }),
]);

export const Set = schema.table('sets', {
  setId: text('set_id').primaryKey(),

  block:  text('block'),
  parent: text('parent'),

  baseSetSize:  integer('base_set_size'),
  totalSetSize: integer('total_set_size'),
  printedSize:  integer('printed_size'),
  cardCount:    integer('card_count').notNull(),
  langs:        locale('langs').array().notNull(),
  rarities:     text('rarities').array().notNull(),

  type:             text('type').notNull(),
  isDigital:        boolean('is_digital').notNull(),
  isOnlineOnly:     boolean('is_online_only'),
  isPaperOnly:      boolean('is_paper_only'),
  isForeignOnly:    boolean('is_foreign_only'),
  isPartialPreview: boolean('is_partial_preview'),
  isFoilOnly:       boolean('is_foil_only').notNull(),
  isNonfoilOnly:    boolean('is_nonfoil_only').notNull(),
  symbolStyle:      text('symbol_style').array(),
  doubleFacedIcon:  text('double_faced_icon').array(),
  keyruneCode:      text('keyrune_code'),

  releaseDate: text('release_date'),

  scryfallId:   uuid('scryfall_id').notNull(),
  scryfallCode: text('scryfall_code').notNull(),

  mtgoCode:         text('mtgo_code'),
  arenaCode:        text('arena_code'),
  tcgPlayerId:      integer('tcg_player_id'),
  tcgplayerGroupId: integer('tcgplayer_group_id'),
  mcmId:            integer('mcm_id'),
  mcmIdExtras:      integer('mcm_id_extras'),
  mcmName:          text('mcm_name'),
  cardsphereSetId:  integer('cardsphere_set_id'),
  tokenSetCode:     text('token_set_code'),
});
