import { jsonb, text, integer } from 'drizzle-orm/pg-core';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';

import { schema } from './schema';

import _ from 'lodash';

import { Updation } from '@model/basic';
import { CardEditorView as ICardEditorView } from '@model/magic/schema/print';
import { Layout, Rarity } from '@model/lorcana/schema/basic';

import { Card, CardLocalization, locale } from './card';

export const Print = schema.table('prints', {
    cardId: text('card_id').notNull(),

    lang:   locale('lang').notNull(),
    set:    text('set').notNull(),
    number: text('number').notNull(),

    name:     text('print_name').notNull(),
    typeline: text('print_typeline').notNull(),
    text:     text('print_text').notNull(),

    flavorText: text('flavor_text'),
    artist:     text('artist').notNull(),

    imageUri: jsonb('image_uri').$type<Record<string, string>>().notNull().default({}),

    printTags: jsonb('print_tags').$type<string[]>().notNull().default([]),

    layout:      jsonb('layout').$type<Layout>().notNull(),
    rarity:      jsonb('rarity').$type<Rarity>().notNull(),
    releaseDate: text('release_date').notNull(),
    finishes:    jsonb('finishes').$type<string[]>(),

    id:           integer('id'),
    code:         text('code'),
    tcgPlayerId:  integer('tcg_player_id'),
    cardMarketId: integer('card_market_id'),
    cardTraderId: integer('card_trader_id'),

    __lockedPaths: text('card_locked_paths').array().notNull().default([]),
    __updations:   jsonb('card_updations').$type<Updation[]>().notNull().default([]),
});

export const PrintView = schema.view('print_view').as(qb => {
    return qb.select()
        .from(Print);
});

export const CardPrintView = schema.view('card_print_view').as(qb => {
    return qb.select({
        cardId: Card.cardId,
        lang:   CardLocalization.lang,
        set:    Print.set,
        number: Print.number,

        card: {
            ..._.omit(getTableColumns(Card), ['cardId', '__lockedPaths', '__updations']),
        },

        cardLocalization: {
            ..._.omit(getTableColumns(CardLocalization), ['cardId', 'lang', '__lockedPaths', '__updations']),
        },

        print: {
            ..._.omit(getTableColumns(Print), ['cardId', 'lang', 'set', 'number', '__lockedPaths', '__updations']),
        },
    })
        .from(Card)
        .innerJoin(CardLocalization, eq(Card.cardId, CardLocalization.cardId))
        .innerJoin(Print, and(eq(Card.cardId, Print.cardId), eq(CardLocalization.lang, Print.lang)));
});

export const CardEditorView = schema.view('card_editor_view').as(qb => {
    return qb.select({
        cardId: Card.cardId,
        lang:   CardLocalization.lang,
        set:    Print.set,
        number: Print.number,

        card: {
            ..._.omit(getTableColumns(Card), ['cardId']),
        },

        cardLocalization: {
            ..._.omit(getTableColumns(CardLocalization), ['cardId', 'lang']),
        },

        print: {
            ..._.omit(getTableColumns(Print), ['cardId', 'set', 'number', 'lang']),
        },

        __inDatabase: sql<boolean>`true`.as('in_database'),
        __original:   sql<ICardEditorView['__original']>`jsonb_build_object()`.as('original'),
    })
        .from(Card)
        .innerJoin(CardLocalization, eq(CardLocalization.cardId, Card.cardId))
        .innerJoin(Print, and(
            eq(Card.cardId, Print.cardId),
            eq(CardLocalization.lang, Print.lang),
        ));
});
