import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  doublePrecision,
} from 'drizzle-orm/pg-core';

import type { MagicSearchCandidatePrints } from '#model/magic/search/manifest';

import { ambit } from '../ambit';
import { color } from '../../../type/bitset';
import { locale } from './card';
import { schema } from './schema';

export const SearchCard = schema.table('search_cards', {
  cardId:  text('card_id').notNull(),
  version: text('version').notNull().default(''),

  ambit:         ambit('ambit').notNull().default('full'),
  manaValue:     doublePrecision('mana_value').notNull(),
  colorIdentity: color('color_identity', { dimensions: 16 }).notNull(),
  tags:          text('tags').array().notNull(),
  rarities:      text('rarities').array().notNull(),
  legalities:    jsonb('legalities').$type<Record<string, string>>().notNull(),

  candidatePrintsByLocale: jsonb('candidate_prints_by_locale').$type<MagicSearchCandidatePrints>().notNull(),

  /** Search-only forms derived from active zhs/zht card localizations. */
  namePinyin:   text('name_pinyin').array().notNull().default(sql`ARRAY[]::text[]`),
  nameInitials: text('name_initials').array().notNull().default(sql`ARRAY[]::text[]`),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.version] }),
  index('search_cards_mana_value_idx').on(table.manaValue),
  index('search_cards_tags_gin_idx').using('gin', table.tags),
]);

export const SearchCardPart = schema.table('search_card_parts', {
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull().default(''),
  partIndex: smallint('part_index').notNull(),

  name:     text('part_name').notNull(),
  typeline: text('part_typeline').notNull(),
  text:     text('part_text').notNull(),

  color:          color('color', { dimensions: 16 }),
  colorIndicator: color('color_indicator', { dimensions: 5 }),

  typeSuper: text('type_super').array(),
  typeMain:  text('type_main').array().notNull(),
  typeSub:   text('type_sub').array(),

  power:        text('power'),
  toughness:    text('toughness'),
  loyalty:      text('loyalty'),
  defense:      text('defense'),
  handModifier: text('hand_modifier'),
  lifeModifier: text('life_modifier'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.partIndex] }),
]);

export const SearchCardPartLocalization = schema.table('search_card_part_localizations', {
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull().default(''),
  locale:    locale('locale').notNull(),
  source:    text('source').notNull().default(''),
  partIndex: smallint('part_index').notNull(),

  name:     text('part_loc_name').notNull(),
  rubyName: text('ruby_name'),
  typeline: text('part_loc_typeline').notNull(),
  text:     text('part_loc_text').notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.locale, table.source, table.partIndex] }),
]);
