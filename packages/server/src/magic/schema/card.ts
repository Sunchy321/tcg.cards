import { bit, boolean, jsonb, numeric, primaryKey, smallint, text } from 'drizzle-orm/pg-core';
import { and, eq, getTableColumns } from 'drizzle-orm';

import { schema } from './schema';

import { Card as ICard } from '@interface/magic/card';

import { omit } from 'lodash';

export const cardLocalizations = schema.table('card_localizations', {
    cardId: text('card_id').notNull(),
    lang:   text('lang').notNull(),

    name:     text('loc_name').notNull(),
    typeline: text('loc_typeline').notNull(),
    text:     text('loc_text').notNull(),
}, table => [
    primaryKey({ columns: [table.cardId, table.lang] }),
]);

export const cardPartLocalizations = schema.table('card_part_localizations', {
    cardId:    text('card_id').notNull(),
    partIndex: smallint('part_index').notNull(),
    lang:      text('lang').notNull(),

    name:     text('part_loc_name').notNull(),
    typeline: text('part_loc_typeline').notNull(),
    text:     text('part_loc_text').notNull(),

    __lastDate: text('last_date').notNull(),
}, table => [
    primaryKey({ columns: [table.cardId, table.partIndex, table.lang] }),
]);

export const cardParts = schema.table('card_parts', {
    cardId:    text('card_id').notNull(),
    partIndex: smallint('part_index').notNull(),

    name:     text('part_name').notNull(),
    typeline: text('part_typeline').notNull(),
    text:     text('part_text').notNull(),

    cost:           text('cost').array(),
    manaValue:      numeric('part_mana_value', { precision: 10, scale: 1 }),
    color:          bit('color', { dimensions: 5 }),
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
}, table => [
    primaryKey({ columns: [table.cardId, table.partIndex] }),
]);

export const cards = schema.table('cards', {
    cardId: text('card_id').primaryKey(),

    name:     text('name').notNull(),
    typeline: text('typeline').notNull(),
    text:     text('text').notNull(),

    manaValue:     numeric('mana_value', { precision: 10, scale: 1 }).notNull(),
    colorIdentity: bit('color_identity', { dimensions: 5 }).notNull(),

    partCount: smallint('part_count').default(1),

    keywords:       text('keywords').array().default([]),
    counters:       text('counters').array().default([]),
    producibleMana: bit('producible_mana', { dimensions: 6 }),
    tags:           text('tags').array().default([]),

    category:       text('category').notNull(),
    legalities:     jsonb('legalities').$type<ICard['legalities']>().notNull(),
    contentWarning: boolean('content_warning').default(false),
});

export const cardView = schema.view('card_view').as(qb => {
    return qb.select({
        cardId:    cards.cardId,
        lang:      cardLocalizations.lang,
        partIndex: cardParts.partIndex,

        card:             { ...omit(getTableColumns(cards), ['cardId']) },
        localization:     { ...omit(getTableColumns(cardLocalizations), ['cardId', 'lang']) },
        part:             { ...omit(getTableColumns(cardParts), ['cardId', 'partIndex']) },
        partLocalization: { ...omit(getTableColumns(cardPartLocalizations), ['cardId', 'lang', 'partIndex']) },
    })
        .from(cards)
        .leftJoin(cardLocalizations, eq(cards.cardId, cardLocalizations.cardId))
        .leftJoin(cardParts, eq(cards.cardId, cardParts.cardId))
        .leftJoin(cardPartLocalizations, and(
            eq(cards.cardId, cardPartLocalizations.cardId),
            eq(cardLocalizations.lang, cardPartLocalizations.lang),
            eq(cardParts.partIndex, cardPartLocalizations.partIndex),
        ));
});
