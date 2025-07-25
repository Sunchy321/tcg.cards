import { bit, boolean, doublePrecision, integer, jsonb, primaryKey, smallint, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const Card = schema.table('cards', {
    cardId:           text('card_id').notNull(),
    partCount:        smallint('part_count').notNull(),
    name:             text('name').notNull(),
    typeline:         text('typeline').notNull(),
    text:             text('text').notNull(),
    manaValue:        integer('mana_value').notNull(),
    colorIdentity:    bit('color_identity', { dimensions: 5 }).notNull(),
    keywords:         text('keywords').array().notNull(),
    counters:         text('counters').array().notNull(),
    producibleMana:   bit('producible_mana', { dimensions: 6 }),
    tags:             text('tags').array().notNull(),
    category:         text('category'),
    legalities:       jsonb('legalities').notNull(),
    contentWarning:   boolean('content_warning'),
    scryfallOracleId: text('scryfall_oracle_id').array().notNull(),
}, table => [
    primaryKey({ columns: [table.cardId] }),
]);

export const CardLocalization = schema.table('card_localizations', {
    cardId:   text('card_id').notNull(),
    lang:     text('lang').notNull(),
    name:     text('loc_name').notNull(),
    typeline: text('loc_typeline').notNull(),
    text:     text('loc_text').notNull(),
}, table => [
    primaryKey({ columns: [table.cardId, table.lang] }),
]);

export const CardPart = schema.table('card_parts', {
    cardId:         text('card_id').notNull(),
    partIndex:      smallint('part_index').notNull(),
    name:           text('part_name').notNull(),
    typeline:       text('part_typeline').notNull(),
    text:           text('part_text').notNull(),
    cost:           text('cost').array(),
    manaValue:      doublePrecision('part_mana_value'),
    color:          bit('color', { dimensions: 5 }),
    colorIndicator: bit('color_indicator', { dimensions: 5 }),
    typeSuper:      text('type_super').array(),
    typeMain:       text('type_main').array().notNull(),
    typeSub:        text('type_sub').array(),
    power:          text('power'),
    toughness:      text('toughness'),
    loyalty:        text('loyalty'),
    defense:        text('defense'),
    handModifier:   text('hand_modifier'),
    lifeModifier:   text('life_modifier'),
}, table => [
    primaryKey({ columns: [table.cardId, table.partIndex] }),
]);

export const CardPartLocalization = schema.table('card_part_localizations', {
    cardId:    text('card_id').notNull(),
    lang:      text('lang').notNull(),
    partIndex: smallint('part_index').notNull(),
    name:      text('part_loc_name').notNull(),
    typeline:  text('part_loc_typeline').notNull(),
    text:      text('part_loc_text').notNull(),
}, table => [
    primaryKey({ columns: [table.cardId, table.lang, table.partIndex] }),
]);
