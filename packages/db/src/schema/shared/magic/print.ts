import { and, eq, getColumns, sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bitset } from '../../../type/bitset';

import { omit } from 'lodash-es';

import { schema } from './schema';

import type { CardEditorView as ICardEditorView } from '#model/magic/schema/print';

import { Card, CardLocalization, CardPart, CardPartLocalization, locale } from './card';

export const Print = schema.table('prints', {
  cardId:  text('card_id').notNull(),
  version: text('version').notNull().default(''),
  set:     text('set').notNull(),
  number:  text('number').notNull(),
  lang:    locale('lang').notNull(),
  source:  text('source').notNull().default(''),

  name:     text('print_name').notNull(),
  typeline: text('print_typeline').notNull(),

  layout:          text('layout').notNull(),
  frame:           text('frame').notNull(),
  frameEffects:    text('frame_effects').array().notNull(),
  borderColor:     text('border_color').notNull(),
  cardBack:        uuid('card_back'),
  securityStamp:   text('security_stamp'),
  promoTypes:      text('promo_types').array(),
  rarity:          text('rarity').notNull(),
  releaseDate:     text('release_date').notNull(),
  isDigital:       boolean('is_digital').notNull(),
  isPromo:         boolean('is_promo').notNull(),
  isReprint:       boolean('is_reprint').notNull(),
  finishes:        text('finishes').array().notNull(),
  hasHighResImage: boolean('has_high_res_image').notNull(),
  imageStatus:     text('image_status').notNull(),
  imageUpdatedAt:  text('image_updated_at'),
  fullImageType:   text('full_image_type').notNull(),
  inBooster:       boolean('in_booster').notNull(),
  games:           text('games').array().notNull(),

  previewDate:   text('preview_date'),
  previewSource: text('preview_source'),
  previewUri:    text('preview_uri'),

  printTags: text('print_tags').array().notNull(),

  isVariation: boolean('variation').notNull().default(false),
  variationOf: uuid('variation_of'),

  artistIds:      uuid('artist_ids').array().notNull().default([]),
  illustrationId: uuid('illustration_id'),
  resourceId:     text('resource_id'),

  scryfallOracleId:  uuid('print_scryfall_oracle_id').notNull(),
  scryfallCardId:    uuid('scryfall_card_id'),
  scryfallFace:      text('scryfall_face'),
  scryfallImageUris: jsonb('scryfall_image_uris').$type<Record<string, string>[]>(),
  arenaId:           integer('arena_id'),
  mtgoId:            integer('mtgo_id'),
  mtgoFoilId:        integer('mtgo_foil_id'),
  multiverseId:      integer('multiverse_id').array().notNull(),
  tcgPlayerId:       integer('tcg_player_id'),
  tcgplayerEtchedId: integer('tcgplayer_etched_id'),
  cardMarketId:      integer('card_market_id'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.set, table.number, table.lang, table.source] }),
]);

export const PrintPart = schema.table('print_parts', {
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull().default(''),
  set:       text('set').notNull(),
  number:    text('number').notNull(),
  lang:      locale('lang').notNull(),
  source:    text('source').notNull().default(''),
  partIndex: smallint('part_index').notNull(),

  name:     text('print_part_name').notNull(),
  typeline: text('print_part_typeline').notNull(),
  text:     text('print_part_text').notNull(),

  attractionLights: bitset('123456')('attraction_lights'),
  flavorName:       text('flavor_name'),
  flavorText:       text('flavor_text'),
  artist:           text('artist'),
  watermark:        text('watermark'),
  scryfallIllusId:  uuid('scryfall_illus_id').array(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.set, table.number, table.lang, table.source, table.partIndex] }),
]);

export const PrintView = schema.view('print_view').as(qb => {
  return qb.select({
    cardId:    Print.cardId,
    version:   Print.version,
    set:       Print.set,
    number:    Print.number,
    lang:      Print.lang,
    source:    Print.source,
    partIndex: PrintPart.partIndex,

    print: {
      ...omit(getColumns(Print), ['cardId', 'version', 'set', 'number', 'lang', 'source', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    printPart: {
      ...omit(getColumns(PrintPart), ['cardId', 'version', 'set', 'number', 'lang', 'source', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },
  })
    .from(Print)
    .innerJoin(PrintPart, and(
      eq(Print.cardId, PrintPart.cardId),
      eq(Print.version, PrintPart.version),
      eq(Print.set, PrintPart.set),
      eq(Print.number, PrintPart.number),
      eq(Print.lang, PrintPart.lang),
      eq(Print.source, PrintPart.source),
    ));
});

export const CardPrintView = schema.view('card_print_view').as(qb => {
  return qb.select({
    cardId:    Card.cardId,
    version:   Card.version,
    locale:    CardLocalization.locale,
    source:    CardLocalization.source,
    partIndex: CardPart.partIndex,
    lang:      Print.lang,
    set:       Print.set,
    number:    Print.number,

    card: {
      ...omit(getColumns(Card), ['cardId', 'version', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    cardLocalization: {
      ...omit(getColumns(CardLocalization), ['cardId', 'version', 'locale', 'source', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    cardPart: {
      ...omit(getColumns(CardPart), ['cardId', 'version', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    cardPartLocalization: {
      ...omit(getColumns(CardPartLocalization), ['cardId', 'version', 'locale', 'source', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    print: {
      ...omit(getColumns(Print), ['cardId', 'version', 'set', 'number', 'lang', 'source', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    printPart: {
      ...omit(getColumns(PrintPart), ['cardId', 'version', 'set', 'number', 'lang', 'source', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
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
    ))
    .innerJoin(Print, and(
      eq(Card.cardId, Print.cardId),
      eq(Card.version, Print.version),
      eq(CardLocalization.source, Print.source),
      sql`${Print.lang} = (
                CASE
                    WHEN EXISTS (SELECT 1 FROM ${Print} WHERE card_id = ${Card.cardId} AND lang = ${CardLocalization.locale})
                    THEN ${CardLocalization.locale}
                    ELSE 'en'
                END
            )`,
    ))
    .innerJoin(PrintPart, and(
      eq(Card.cardId, PrintPart.cardId),
      eq(Card.version, PrintPart.version),
      eq(Print.set, PrintPart.set),
      eq(Print.number, PrintPart.number),
      eq(Print.lang, PrintPart.lang),
      eq(Print.source, PrintPart.source),
      eq(CardPart.partIndex, PrintPart.partIndex),
    ));
});

export const CardEditorView = schema.view('card_editor_view').as(qb => {
  return qb.select({
    cardId:    Card.cardId,
    version:   Card.version,
    locale:    CardLocalization.locale,
    source:    CardLocalization.source,
    partIndex: CardPart.partIndex,
    lang:      Print.lang,
    set:       Print.set,
    number:    Print.number,

    card: {
      ...omit(getColumns(Card), ['cardId', 'version', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    cardLocalization: {
      ...omit(getColumns(CardLocalization), ['cardId', 'version', 'locale', 'source', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    cardPart: {
      ...omit(getColumns(CardPart), ['cardId', 'version', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    cardPartLocalization: {
      ...omit(getColumns(CardPartLocalization), ['cardId', 'version', 'locale', 'source', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    print: {
      ...omit(getColumns(Print), ['cardId', 'version', 'set', 'number', 'lang', 'source', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    printPart: {
      ...omit(getColumns(PrintPart), ['cardId', 'version', 'set', 'number', 'lang', 'source', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },

    __inDatabase: sql<boolean>`true`.as('in_database'),
    __original:   sql<ICardEditorView['__original']>`jsonb_build_object()`.as('original'),
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
    ))
    .innerJoin(Print, and(
      eq(Card.cardId, Print.cardId),
      eq(Card.version, Print.version),
      eq(CardLocalization.source, Print.source),
      sql`${Print.lang} = (
                CASE
                    WHEN EXISTS (SELECT 1 FROM ${Print} WHERE card_id = ${Card.cardId} AND lang = ${CardLocalization.locale})
                    THEN ${CardLocalization.locale}
                    ELSE 'en'
                END
            )`,
    ))
    .innerJoin(PrintPart, and(
      eq(Card.cardId, PrintPart.cardId),
      eq(Card.version, PrintPart.version),
      eq(Print.set, PrintPart.set),
      eq(Print.number, PrintPart.number),
      eq(Print.lang, PrintPart.lang),
      eq(Print.source, PrintPart.source),
      eq(CardPart.partIndex, PrintPart.partIndex),
    ));
});
