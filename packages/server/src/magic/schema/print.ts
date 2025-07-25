import { bit, boolean, integer, jsonb, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { and, eq, getTableColumns } from 'drizzle-orm';

import { schema } from './schema';

import { omit } from 'lodash';

export const printParts = schema.table('print_parts', {
    cardId:    text('card_id').notNull(),
    lang:      text('lang').notNull(),
    set:       text('set').notNull(),
    number:    text('number').notNull(),
    partIndex: smallint('part_index').notNull(),

    name:     text('print_part_name').notNull(),
    typeline: text('print_part_typeline').notNull(),
    text:     text('print_part_text').notNull(),

    attractionLights: bit('attraction_lights', { dimensions: 6 }),

    scryfallIllusId: uuid('scryfall_illus_id').array(),
    flavorName:      text('flavor_name'),
    flavorText:      text('flavor_text'),
    artist:          text('artist'),
    watermark:       text('watermark'),
}, table => [
    primaryKey({ columns: [table.cardId, table.lang, table.set, table.number, table.partIndex] }),
]);

export const prints = schema.table('prints', {
    cardId: text('card_id').notNull(),
    lang:   text('lang').notNull(),
    set:    text('set').notNull(),
    number: text('number').notNull(),

    layout:        text('layout').notNull(),
    frame:         text('frame').notNull(),
    frameEffects:  text('frame_effects').array().notNull(),
    borderColor:   text('border_color').notNull(),
    cardBack:      uuid('card_back'),
    securityStamp: text('security_stamp'),
    promoTypes:    text('promo_types').array(),
    rarity:        text('rarity'),
    releaseDate:   text('release_date'),

    isDigital:       boolean('is_digital').notNull(),
    isPromo:         boolean('is_promo').notNull(),
    isReprint:       boolean('is_reprint').notNull(),
    finishes:        text('finishes').array().notNull(),
    hasHighResImage: boolean('has_high_res_image').notNull(),
    imageStatus:     text('image_status').notNull(),

    inBooster: boolean('in_booster').notNull(),
    games:     text('games').array().notNull(),

    tags: text('print_tags').array().default([]),

    previewDate:   text('preview_date'),
    previewSource: text('preview_source'),
    previewUri:    text('preview_uri'),

    scryfallOracleId:  uuid('scryfall_oracle_id').notNull(),
    scryfallCardId:    uuid('scryfall_card_id'),
    scryfallFace:      text('scryfall_face'),
    scryfallImageUris: jsonb('scryfall_image_uris'),

    arenaId:      integer('arena_id'),
    mtgoId:       integer('mtgo_id'),
    mtgoFoilId:   integer('mtgo_foil_id'),
    multiverseId: integer('multiverse_id').array().default([]),
    tcgPlayerId:  integer('tcg_player_id'),
    cardMarketId: integer('card_market_id'),
}, table => [
    primaryKey({ columns: [table.cardId, table.lang, table.set, table.number] }),
]);

export const printView = schema.view('print_view').as(qb => {
    return qb.select({
        cardId:    prints.cardId,
        lang:      prints.lang,
        set:       prints.set,
        number:    prints.number,
        partIndex: printParts.partIndex,

        print: {
            ...omit(getTableColumns(prints), ['cardId', 'lang', 'set', 'number']),
        },

        printPart: {
            ...omit(getTableColumns(printParts), ['cardId', 'lang', 'set', 'number', 'partIndex']),
        },
    })
        .from(prints)
        .leftJoin(printParts, and(
            eq(prints.cardId, printParts.cardId),
            eq(prints.lang, printParts.lang),
            eq(prints.set, printParts.set),
            eq(prints.number, printParts.number),
        ));
});

// export const cardPrintView = schema.view('card_print_view').as(qb => {
//     return qb.select({
//         cardId:    printView.cardId,
//         lang:      printView.lang,
//         set:       printView.set,
//         number:    printView.number,
//         partIndex: printView.partIndex,

//         card:             cardView.card,
//         localization:     cardView.localization,
//         part:             cardView.part,
//         partLocalization: cardView.partLocalization,

//         print:     printView.print,
//         printPart: printView.printPart,
//     }).from(cardView)
//         .leftJoin(printView, and(
//             eq(cardView.cardId, printView.cardId),
//             eq(cardView.lang, printView.lang),
//             eq(cardView.partIndex, printView.partIndex),
//         ));
// });
