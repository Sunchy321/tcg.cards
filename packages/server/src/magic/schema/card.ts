import { getTableColumns, and, eq } from 'drizzle-orm';
import { bit, boolean, doublePrecision, jsonb, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';

import _ from 'lodash';

import { schema } from './schema';

import { Updation } from '@model/basic';
import * as basicModel from '@model/magic/schema/basic';
import * as cardModel from '@model/magic/schema/card';
import { Legality } from '@model/magic/schema/game-change';

export const locale = schema.enum('locale', basicModel.locale.enum);
export const category = schema.enum('category', cardModel.category.enum);

export const Card = schema.table('cards', {
    cardId:    text('card_id').primaryKey(),
    partCount: smallint('part_count').notNull(),

    name:     text('name').notNull(),
    typeline: text('typeline').notNull(),
    text:     text('text').notNull(),

    manaValue:     doublePrecision('mana_value').notNull(),
    colorIdentity: bit('color_identity', { dimensions: 16 }).notNull(),

    keywords:       text('keywords').array().notNull(),
    counters:       text('counters').array().notNull(),
    producibleMana: bit('producible_mana', { dimensions: 6 }),
    contentWarning: boolean('content_warning'),

    category: category('category').notNull(),
    tags:     text('tags').array().notNull(),

    legalities: jsonb('legalities').$type<Record<string, Legality>>().notNull(),

    scryfallOracleId: uuid('scryfall_oracle_id').array().notNull(),

    __lockedPaths: text('card_locked_paths').array().notNull().default([]),
    __updations:   jsonb('card_updations').$type<Updation[]>().notNull().default([]),
});

export const CardLocalization = schema.table('card_localizations', {
    cardId: text('card_id').notNull(),
    lang:   locale('lang').notNull(),

    name:     text('loc_name').notNull(),
    typeline: text('loc_typeline').notNull(),
    text:     text('loc_text').notNull(),

    __lastDate:    text('last_date').notNull(),
    __lockedPaths: text('card_localization_locked_paths').array().notNull().default([]),
    __updations:   jsonb('card_localization_updations').$type<Updation[]>().notNull().default([]),
}, table => [
    primaryKey({ columns: [table.cardId, table.lang] }),
]);

export const CardPart = schema.table('card_parts', {
    cardId:    text('card_id').notNull(),
    partIndex: smallint('part_index').notNull(),

    name:     text('part_name').notNull(),
    typeline: text('part_typeline').notNull(),
    text:     text('part_text').notNull(),

    cost:      text('cost').array(),
    manaValue: doublePrecision('part_mana_value'),

    color:          bit('color', { dimensions: 16 }),
    colorIndicator: bit('color_indicator', { dimensions: 5 }),

    typeSuper: text('type_super').array(),
    typeMain:  text('type_main').array().notNull(),
    typeSub:   text('type_sub').array(),

    power:        text('power'),
    toughness:    text('toughness'),
    loyalty:      text('loyalty'),
    defense:      text('defense'),
    handModifier: text('hand_modifier'),
    lifeModifier: text('life_modifier'),

    __lockedPaths: text('card_part_locked_paths').array().notNull().default([]),
    __updations:   jsonb('card_part_updations').$type<Updation[]>().notNull().default([]),
}, table => [
    primaryKey({ columns: [table.cardId, table.partIndex] }),
]);

export const CardPartLocalization = schema.table('card_part_localizations', {
    cardId:    text('card_id').notNull(),
    lang:      locale('lang').notNull(),
    partIndex: smallint('part_index').notNull(),

    name:     text('part_loc_name').notNull(),
    typeline: text('part_loc_typeline').notNull(),
    text:     text('part_loc_text').notNull(),

    __lockedPaths: text('card_part_localization_locked_paths').array().notNull().default([]),
    __updations:   jsonb('card_part_localization_updations').$type<Updation[]>().notNull().default([]),
}, table => [
    primaryKey({ columns: [table.cardId, table.lang, table.partIndex] }),
]);

export const CardView = schema.view('card_view').as(qb => {
    return qb.select({
        cardId:    Card.cardId,
        lang:      CardLocalization.lang,
        partIndex: CardPart.partIndex,

        card: {
            ..._.omit(getTableColumns(Card), ['cardId', '__lockedPaths', '__updations']),
        },

        localization: {
            ..._.omit(getTableColumns(CardLocalization), ['cardId', 'lang', '__lockedPaths', '__updations']),
        },

        part: {
            ..._.omit(getTableColumns(CardPart), ['cardId', 'partIndex', '__lockedPaths', '__updations']),
        },

        partLocalization: {
            ..._.omit(getTableColumns(CardPartLocalization), ['cardId', 'lang', 'partIndex', '__lockedPaths', '__updations']),
        },
    })
        .from(Card)
        .innerJoin(CardLocalization, eq(CardLocalization.cardId, Card.cardId))
        .innerJoin(CardPart, eq(CardPart.cardId, Card.cardId))
        .innerJoin(CardPartLocalization, and(eq(CardPartLocalization.cardId, CardPart.cardId), eq(CardPartLocalization.lang, CardLocalization.lang), eq(CardPartLocalization.partIndex, CardPart.partIndex)));
});
