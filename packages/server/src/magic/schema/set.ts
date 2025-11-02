import { bigint, boolean, integer, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { schema } from './schema';

import { locale } from './card';
import { rarity } from './print';

export const SetLocalization = schema.table('set_localizations', {
    setId: text('set_id').notNull(),
    lang:  text('lang').notNull(),

    name: text('name'),
    link: text('url'),
}, table => [
    primaryKey({ columns: [table.setId, table.lang] }),
]);

export const PackContent = schema.table('pack_contents', {
    id:     uuid('id').primaryKey().defaultRandom(),
    packId: uuid('pack_id').notNull(),

    type:  text('type').notNull(),
    count: integer('count').notNull(),
});

export const Pack = schema.table('packs', {
    id:        uuid('id').primaryKey().defaultRandom(),
    boosterId: uuid('booster_id').notNull(),

    weight: integer('weight').notNull(),
});

export const SheetCard = schema.table('booster_sheet_cards', {
    id:      uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id'),

    cardId: text('card_id').notNull(),

    set:    text('set').notNull(),
    number: text('number').notNull(),
    lang:   text('lang'),

    weight: bigint('weight', { mode: 'number' }).notNull(),
});

export const Sheet = schema.table('booster_sheets', {
    id:        uuid('id').primaryKey().defaultRandom(),
    boosterId: uuid('booster_id').notNull(),

    typeId: text('type_id').notNull(),

    totalWeight: bigint('total_weight', { mode: 'number' }).notNull(),

    allowDuplicates: boolean('allow_duplicates').notNull(),
    balanceColors:   boolean('balance_colors').notNull(),
    isFoil:          boolean('is_foil').notNull(),
    isFixed:         boolean('is_fixed').notNull(),
});

export const Booster = schema.table('boosters', {
    id: uuid('id').primaryKey().defaultRandom(),

    setId:     text('set_id').notNull(),
    boosterId: text('booster_id').notNull(),

    totalWeight: bigint('total_weight', { mode: 'number' }).notNull(),
});

export const Set = schema.table('sets', {
    setId: text('set_id').primaryKey(),

    block:  text('block'),
    parent: text('parent'),

    printedSize: integer('printed_size'),
    cardCount:   integer('card_count').notNull(),
    langs:       locale('langs').array().notNull(),
    rarities:    rarity('rarities').array().notNull(),

    type:            text('type').notNull(),
    isDigital:       boolean('is_digital').notNull(),
    isFoilOnly:      boolean('is_foil_only').notNull(),
    isNonfoilOnly:   boolean('is_nonfoil_only').notNull(),
    symbolStyle:     text('symbol_style').array(),
    doubleFacedIcon: text('double_faced_icon').array(),

    releaseDate: text('release_date'),

    scryfallId:   uuid('scryfall_id').notNull(),
    scryfallCode: text('scryfall_code').notNull(),

    mtgoCode:    text('mtgo_code'),
    tcgPlayerId: integer('tcg_player_id'),
});
