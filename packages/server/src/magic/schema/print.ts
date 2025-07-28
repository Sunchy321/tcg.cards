import { bit, boolean, integer, jsonb, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';

import { and, eq, getTableColumns } from 'drizzle-orm';
import _ from 'lodash';
import { schema } from './schema';

export const Print = schema.table('prints', {
    cardId:            text('card_id').notNull(),
    set:               text('set').notNull(),
    number:            text('number').notNull(),
    lang:              text('lang').notNull(),
    printTags:         text('print_tags').array().notNull(),
    layout:            text('layout'),
    frame:             text('frame'),
    frameEffects:      text('frame_effects').array().notNull(),
    borderColor:       text('border_color'),
    cardBack:          uuid('card_back').notNull(),
    securityStamp:     text('security_stamp'),
    promoTypes:        text('promo_types').array(),
    rarity:            text('rarity'),
    releaseDate:       text('release_date').notNull(),
    isDigital:         boolean('is_digital').notNull(),
    isPromo:           boolean('is_promo').notNull(),
    isReprint:         boolean('is_reprint').notNull(),
    finishes:          text('finishes').array().notNull(),
    hasHighResImage:   boolean('has_high_res_image').notNull(),
    imageStatus:       text('image_status'),
    inBooster:         boolean('in_booster').notNull(),
    games:             text('games').array().notNull(),
    previewDate:       text('preview_date'),
    previewSource:     text('preview_source'),
    previewUri:        text('preview_uri'),
    scryfallOracleId:  uuid('scryfall_oracle_id').notNull(),
    scryfallCardId:    uuid('scryfall_card_id'),
    scryfallFace:      text('scryfall_face'),
    scryfallImageUris: jsonb('scryfall_image_uris').array().notNull(),
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
        parts:     {
            ..._.omit(getTableColumns(PrintPart), ['cardId', 'set', 'number', 'lang', 'partIndex']),
        },
    })
        .from(Print)
        .leftJoin(PrintPart, and(eq(Print.cardId, PrintPart.cardId), eq(Print.set, PrintPart.set), eq(Print.number, PrintPart.number), eq(Print.lang, PrintPart.lang)));
});
