import { and, eq, getColumns } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bitset, color } from '../../../type/bitset';

import { omit } from 'lodash-es';

import { schema } from './schema';

import * as basicModel from '#model/magic/schema/basic';
import * as cardModel from '#model/magic/schema/card';

export const locale = schema.enum('locale', basicModel.locale.enum);
export const category = schema.enum('category', cardModel.category.enum);

export const Card = schema.table('cards', {
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull().default(''),
  partCount: smallint('part_count').notNull(),

  name:     text('name').notNull(),
  typeline: text('typeline').notNull(),

  manaValue:     doublePrecision('mana_value').notNull(),
  colorIdentity: color('color_identity', { dimensions: 16 }).notNull(),

  keywords:          text('keywords').array().notNull(),
  counters:          text('counters').array().notNull(),
  producibleMana:    bitset('WUBRGCT')('producible_mana'),
  hasContentWarning: boolean('content_warning'),

  category: category('category').notNull(),
  tags:     text('tags').array().notNull(),

  legalities: jsonb('legalities').$type<Record<string, string>>().notNull(),

  scryfallOracleId: uuid('scryfall_oracle_id').array().notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.version] }),
]);

export const CardLocalization = schema.table('card_localizations', {
  cardId:  text('card_id').notNull(),
  version: text('version').notNull().default(''),
  locale:  locale('locale').notNull(),
  source:  text('source').notNull().default(''),

  name:     text('loc_name').notNull(),
  typeline: text('loc_typeline').notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.locale, table.source] }),
]);

export const CardPart = schema.table('card_parts', {
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull().default(''),
  partIndex: smallint('part_index').notNull(),

  name:     text('part_name').notNull(),
  typeline: text('part_typeline').notNull(),
  text:     text('part_text').notNull(),

  cost:      text('cost').array(),
  manaValue: doublePrecision('part_mana_value'),

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

export const CardPartLocalization = schema.table('card_part_localizations', {
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull().default(''),
  locale:    locale('locale').notNull(),
  source:    text('source').notNull().default(''),
  partIndex: smallint('part_index').notNull(),

  name:     text('part_loc_name').notNull(),
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

export const CardView = schema.view('card_view').as(qb => {
  return qb.select({
    cardId:    Card.cardId,
    version:   Card.version,
    locale:    CardLocalization.locale,
    source:    CardLocalization.source,
    partIndex: CardPart.partIndex,

    card: {
      ...omit(getColumns(Card), ['cardId', 'version', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    localization: {
      ...omit(getColumns(CardLocalization), ['cardId', 'version', 'locale', 'source', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    part: {
      ...omit(getColumns(CardPart), ['cardId', 'version', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    partLocalization: {
      ...omit(getColumns(CardPartLocalization), ['cardId', 'version', 'locale', 'source', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },
  })
    .from(Card)
    .innerJoin(CardLocalization, and(eq(CardLocalization.cardId, Card.cardId), eq(CardLocalization.version, Card.version)))
    .innerJoin(CardPart, and(eq(CardPart.cardId, Card.cardId), eq(CardPart.version, Card.version)))
    .innerJoin(CardPartLocalization, and(
      eq(CardPartLocalization.cardId, CardPart.cardId),
      eq(CardPartLocalization.version, CardPart.version),
      eq(CardPartLocalization.locale, CardLocalization.locale),
      eq(CardPartLocalization.source, CardLocalization.source),
      eq(CardPartLocalization.partIndex, CardPart.partIndex),
    ));
});
