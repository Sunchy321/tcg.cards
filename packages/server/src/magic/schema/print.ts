import { getTableColumns, and, eq, sql } from 'drizzle-orm';
import { bit, boolean, integer, jsonb, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';

import _ from 'lodash';

import { schema } from './schema';

import { Updation } from '@model/basic';
import { CardEditorView as ICardEditorView } from '@model/magic/schema/print';
import * as basicModel from '@model/magic/schema/basic';
import * as printModel from '@model/magic/schema/print';

import { Card, CardLocalization, CardPart, CardPartLocalization, fullLocale } from './card';

export const layout = schema.enum('layout', basicModel.layout.enum);
export const frame = schema.enum('frame', printModel.frame.enum);
export const borderColor = schema.enum('border_color', printModel.borderColor.enum);
export const securityStamp = schema.enum('security_stamp', printModel.securityStamp.enum);
export const rarity = schema.enum('rarity', basicModel.rarity.enum);
export const finish = schema.enum('finish', printModel.finish.enum);
export const imageStatus = schema.enum('image_status', printModel.imageStatus.enum);
export const fullImageType = schema.enum('full_image_type', basicModel.fullImageType.enum);
export const game = schema.enum('game', printModel.game.enum);
export const scryfallFace = schema.enum('scryfall_face', printModel.scryfallFace.enum);

export const Print = schema.table('prints', {
    cardId: text('card_id').notNull(),
    set:    text('set').notNull(),
    number: text('number').notNull(),
    lang:   fullLocale('lang').notNull(),

    name:     text('print_name').notNull(),
    typeline: text('print_typeline').notNull(),
    text:     text('print_text').notNull(),

    layout:          layout('layout').notNull(),
    frame:           frame('frame').notNull(),
    frameEffects:    text('frame_effects').array().notNull(),
    borderColor:     borderColor('border_color').notNull(),
    cardBack:        uuid('card_back'),
    securityStamp:   securityStamp('security_stamp'),
    promoTypes:      text('promo_types').array(),
    rarity:          rarity('rarity').notNull(),
    releaseDate:     text('release_date').notNull(),
    isDigital:       boolean('is_digital').notNull(),
    isPromo:         boolean('is_promo').notNull(),
    isReprint:       boolean('is_reprint').notNull(),
    finishes:        finish('finishes').array().notNull(),
    hasHighResImage: boolean('has_high_res_image').notNull(),
    imageStatus:     imageStatus('image_status').notNull(),
    fullImageType:   fullImageType('full_image_type').notNull(),
    inBooster:       boolean('in_booster').notNull(),
    games:           game('games').array().notNull(),

    previewDate:   text('preview_date'),
    previewSource: text('preview_source'),
    previewUri:    text('preview_uri'),

    printTags: text('print_tags').array().notNull(),

    scryfallOracleId:  uuid('print_scryfall_oracle_id').notNull(),
    scryfallCardId:    uuid('scryfall_card_id'),
    scryfallFace:      scryfallFace('scryfall_face'),
    scryfallImageUris: jsonb('scryfall_image_uris').$type<Record<string, string>[]>(),
    arenaId:           integer('arena_id'),
    mtgoId:            integer('mtgo_id'),
    mtgoFoilId:        integer('mtgo_foil_id'),
    multiverseId:      integer('multiverse_id').array().notNull(),
    tcgPlayerId:       integer('tcg_player_id'),
    cardMarketId:      integer('card_market_id'),

    __lockedPaths: text('print_locked_paths').array().notNull().default([]),
    __updations:   jsonb('print_updations').$type<Updation[]>().notNull().default([]),
}, table => [
    primaryKey({ columns: [table.cardId, table.set, table.number, table.lang] }),
]);

export const PrintPart = schema.table('print_parts', {
    cardId:    text('card_id').notNull(),
    set:       text('set').notNull(),
    number:    text('number').notNull(),
    lang:      fullLocale('lang').notNull(),
    partIndex: smallint('part_index').notNull(),

    name:     text('print_part_name').notNull(),
    typeline: text('print_part_typeline').notNull(),
    text:     text('print_part_text').notNull(),

    attractionLights: bit('attraction_lights', { dimensions: 6 }),
    flavorName:       text('flavor_name'),
    flavorText:       text('flavor_text'),
    artist:           text('artist'),
    watermark:        text('watermark'),
    scryfallIllusId:  uuid('scryfall_illus_id').array(),

    __lockedPaths: text('print_part_locked_paths').array().notNull().default([]),
    __updations:   jsonb('print_part_updations').$type<Updation[]>().notNull().default([]),
}, table => [
    primaryKey({ columns: [table.cardId, table.set, table.number, table.lang, table.partIndex] }),
]);

export const PrintView = schema.view('print_view').as(qb => {
    return qb.select({
        cardId:    Print.cardId,
        set:       Print.set,
        number:    Print.number,
        lang:      Print.lang,
        partIndex: PrintPart.partIndex,

        print: {
            ..._.omit(getTableColumns(Print), ['cardId', 'set', 'number', 'lang', '__lockedPaths', '__updations']),
        },

        printPart: {
            ..._.omit(getTableColumns(PrintPart), ['cardId', 'set', 'number', 'lang', 'partIndex', '__lockedPaths', '__updations']),
        },
    })
        .from(Print)
        .innerJoin(PrintPart, and(eq(Print.cardId, PrintPart.cardId), eq(Print.set, PrintPart.set), eq(Print.number, PrintPart.number), eq(Print.lang, PrintPart.lang)));
});

export const CardPrintView = schema.view('card_print_view').as(qb => {
    return qb.select({
        cardId:    Card.cardId,
        lang:      CardLocalization.lang,
        partIndex: CardPart.partIndex,
        set:       Print.set,
        number:    Print.number,

        card: {
            ..._.omit(getTableColumns(Card), ['cardId', '__lockedPaths', '__updations']),
        },

        cardLocalization: {
            ..._.omit(getTableColumns(CardLocalization), ['cardId', 'lang', '__lockedPaths', '__updations']),
        },

        cardPart: {
            ..._.omit(getTableColumns(CardPart), ['cardId', 'partIndex', '__lockedPaths', '__updations']),
        },

        cardPartLocalization: {
            ..._.omit(getTableColumns(CardPartLocalization), ['cardId', 'lang', 'partIndex', '__lockedPaths', '__updations']),
        },

        print: {
            ..._.omit(getTableColumns(Print), ['cardId', 'set', 'number', 'lang', '__lockedPaths', '__updations']),
        },

        printPart: {
            ..._.omit(getTableColumns(PrintPart), ['cardId', 'set', 'number', 'lang', 'partIndex', '__lockedPaths', '__updations']),
        },
    })
        .from(Card)
        .innerJoin(CardLocalization, eq(CardLocalization.cardId, Card.cardId))
        .innerJoin(CardPart, eq(CardPart.cardId, Card.cardId))
        .innerJoin(CardPartLocalization, and(
            eq(CardPartLocalization.cardId, CardPart.cardId),
            eq(CardPartLocalization.lang, CardLocalization.lang),
            eq(CardPartLocalization.partIndex, CardPart.partIndex),
        ))
        .innerJoin(Print, and(
            eq(Card.cardId, Print.cardId),
            eq(CardLocalization.lang, Print.lang),
        ))
        .innerJoin(PrintPart, and(
            eq(Card.cardId, PrintPart.cardId),
            eq(Print.set, PrintPart.set),
            eq(Print.number, PrintPart.number),
            eq(CardLocalization.lang, PrintPart.lang),
            eq(CardPart.partIndex, PrintPart.partIndex),
        ));
});

export const CardEditorView = schema.view('card_editor_view').as(qb => {
    return qb.select({
        cardId:    Card.cardId,
        lang:      CardLocalization.lang,
        partIndex: CardPart.partIndex,
        set:       Print.set,
        number:    Print.number,

        card: {
            ..._.omit(getTableColumns(Card), ['cardId']),
        },

        cardLocalization: {
            ..._.omit(getTableColumns(CardLocalization), ['cardId', 'lang']),
        },

        cardPart: {
            ..._.omit(getTableColumns(CardPart), ['cardId', 'partIndex']),
        },

        cardPartLocalization: {
            ..._.omit(getTableColumns(CardPartLocalization), ['cardId', 'lang', 'partIndex']),
        },

        print: {
            ..._.omit(getTableColumns(Print), ['cardId', 'set', 'number', 'lang']),
        },

        printPart: {
            ..._.omit(getTableColumns(PrintPart), ['cardId', 'set', 'number', 'lang', 'partIndex']),
        },

        __inDatabase: sql<boolean>`true`.as('in_database'),
        __original:   sql<ICardEditorView['__original']>`jsonb_build_object()`.as('original'),
    })
        .from(Card)
        .innerJoin(CardLocalization, eq(CardLocalization.cardId, Card.cardId))
        .innerJoin(CardPart, eq(CardPart.cardId, Card.cardId))
        .innerJoin(CardPartLocalization, and(
            eq(CardPartLocalization.cardId, CardPart.cardId),
            eq(CardPartLocalization.lang, CardLocalization.lang),
            eq(CardPartLocalization.partIndex, CardPart.partIndex),
        ))
        .innerJoin(Print, and(
            eq(Card.cardId, Print.cardId),
            eq(CardLocalization.lang, Print.lang),
        ))
        .innerJoin(PrintPart, and(
            eq(Card.cardId, PrintPart.cardId),
            eq(Print.set, PrintPart.set),
            eq(Print.number, PrintPart.number),
            eq(CardLocalization.lang, PrintPart.lang),
            eq(CardPart.partIndex, PrintPart.partIndex),
        ));
});
