import { getTableColumns, and, eq } from 'drizzle-orm';
import { bit, boolean, integer, jsonb, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';

import _ from 'lodash';

import { schema } from './schema';

import { borderColor, finish, frame, game, imageStatus, layout, rarity, scryfallFace, securityStamp } from '@model/magic/print';
import { Card, CardLocalization, CardPart, CardPartLocalization } from './card';

export const Layout = schema.enum('layout', layout.options);
export const Frame = schema.enum('frame', frame.options);
export const BorderColor = schema.enum('border_color', borderColor.options);
export const SecurityStamp = schema.enum('security_stamp', securityStamp.options);
export const Rarity = schema.enum('rarity', rarity.options);
export const Finish = schema.enum('finish', finish.options);
export const ImageStatus = schema.enum('image_status', imageStatus.options);
export const Game = schema.enum('game', game.options);
export const ScryfallFace = schema.enum('scryfall_face', scryfallFace.options);

export const Print = schema.table('prints', {
    cardId:            text('card_id').notNull(),
    set:               text('set').notNull(),
    number:            text('number').notNull(),
    lang:              text('lang').notNull(),
    printTags:         text('print_tags').array().notNull(),
    layout:            Layout('layout').notNull(),
    frame:             Frame('frame').notNull(),
    frameEffects:      text('frame_effects').array().notNull(),
    borderColor:       BorderColor('border_color').notNull(),
    cardBack:          uuid('card_back'),
    securityStamp:     SecurityStamp('security_stamp'),
    promoTypes:        text('promo_types').array(),
    rarity:            Rarity('rarity').notNull(),
    releaseDate:       text('release_date').notNull(),
    isDigital:         boolean('is_digital').notNull(),
    isPromo:           boolean('is_promo').notNull(),
    isReprint:         boolean('is_reprint').notNull(),
    finishes:          Finish('finishes').array().notNull(),
    hasHighResImage:   boolean('has_high_res_image').notNull(),
    imageStatus:       ImageStatus('image_status').notNull(),
    inBooster:         boolean('in_booster').notNull(),
    games:             Game('games').array().notNull(),
    previewDate:       text('preview_date'),
    previewSource:     text('preview_source'),
    previewUri:        text('preview_uri'),
    scryfallOracleId:  uuid('print_scryfall_oracle_id').notNull(),
    scryfallCardId:    uuid('scryfall_card_id'),
    scryfallFace:      ScryfallFace('scryfall_face'),
    scryfallImageUris: jsonb('scryfall_image_uris').$type<Record<string, string>[]>(),
    arenaId:           integer('arena_id'),
    mtgoId:            integer('mtgo_id'),
    mtgoFoilId:        integer('mtgo_foil_id'),
    multiverseId:      integer('multiverse_id').array().notNull(),
    tcgPlayerId:       integer('tcg_player_id'),
    cardMarketId:      integer('card_market_id'),
}, table => [
    primaryKey({ columns: [table.cardId, table.set, table.number, table.lang] }),
]);

export const PrintPart = schema.table('print_parts', {
    cardId:           text('card_id').notNull(),
    set:              text('set').notNull(),
    number:           text('number').notNull(),
    lang:             text('lang').notNull(),
    partIndex:        smallint('part_index').notNull(),
    name:             text('print_name').notNull(),
    typeline:         text('print_typeline').notNull(),
    text:             text('print_text').notNull(),
    attractionLights: bit('attraction_lights', { dimensions: 6 }),
    flavorName:       text('flavor_name'),
    flavorText:       text('flavor_text'),
    artist:           text('artist'),
    watermark:        text('watermark'),
    scryfallIllusId:  uuid('scryfall_illus_id').array(),
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

        ..._.omit(getTableColumns(Print), ['cardId', 'set', 'number', 'lang']),

        part: {
            ..._.omit(getTableColumns(PrintPart), ['cardId', 'set', 'number', 'lang', 'partIndex']),
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
            ..._.omit(getTableColumns(Card), 'cardId'),
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
