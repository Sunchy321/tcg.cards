import { getTableColumns, and, eq, sql } from 'drizzle-orm';
import { integer, jsonb, primaryKey, text } from 'drizzle-orm/pg-core';

import _ from 'lodash';

import { schema } from './schema';

import { Updation } from '@model/basic';
import { CardEditorView as ICardEditorView } from '@model/yugioh/schema/print';
import * as basicModel from '@model/yugioh/schema/basic';

import { Card, CardLocalization, fullLocale } from './card';

export const layout = schema.enum('layout', basicModel.layout.enum);

export const Print = schema.table('prints', {
    cardId: text('card_id').notNull(),
    set:    text('set').notNull(),
    number: text('number').notNull(),
    lang:   fullLocale('lang').notNull(),

    name:     text('print_name').notNull(),
    rubyName: text('print_ruby_name'),
    typeline: text('print_typeline').notNull(),
    text:     text('print_text').notNull(),
    comment:  text('print_comment'),

    layout:      layout('layout').notNull(),
    passcode:    integer('print_passcode'),
    rarity:      text('rarity').notNull(),
    releaseDate: text('release_date'),

    printTags: text('print_tags').array().notNull().default([]),

    __lockedPaths: text('print_locked_paths').array().notNull().default([]),
    __updations:   jsonb('print_updations').$type<Updation[]>().notNull().default([]),
}, table => [
    primaryKey({ columns: [table.cardId, table.set, table.number, table.lang] }),
]);

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
            ..._.omit(getTableColumns(Print), ['cardId', 'set', 'number', 'lang', '__lockedPaths', '__updations']),
        },
    })
        .from(Card)
        .innerJoin(CardLocalization, eq(CardLocalization.cardId, Card.cardId))
        .innerJoin(Print, and(
            eq(Card.cardId, Print.cardId),
            eq(CardLocalization.lang, Print.lang),
        ));
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
