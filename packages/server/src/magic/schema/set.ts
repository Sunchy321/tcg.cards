import { boolean, integer, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { schema } from './schema';

export const setLocalizations = schema.table('set_localizations', {
    setId: text('set_id').notNull(),
    lang:  text('lang').notNull(),
}, table => [
    primaryKey({ columns: [table.setId, table.lang] }),
]);

export const packContents = schema.table('pack_contents', {
    id:     uuid('id').primaryKey().defaultRandom(),
    packId: uuid('pack_id').notNull(),

    type:  text('type').notNull(),
    count: integer('type').notNull(),
});

export const packs = schema.table('packs', {
    id:        uuid('id').primaryKey().defaultRandom(),
    boosterId: uuid('booster_id').notNull(),

    setId:  text('set_id').notNull(),
    packId: text('pack_id').notNull(),

    weight: integer('weight').notNull(),
});

export const sheetCards = schema.table('booster_sheet_cards', {
    id:      uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id'),

    cardId: text('card_id').notNull(),

    set:    text('set').notNull(),
    number: text('number').notNull(),
    lang:   text('lang'),

    weight: integer('weight').notNull(),
});

export const sheets = schema.table('booster_sheets', {
    id:        uuid('id').primaryKey().defaultRandom(),
    boosterId: uuid('booster_id').notNull(),

    typeId: text('type_id').notNull(),

    totalWeight: integer('total_weight').notNull(),

    allowDuplicates: boolean('allow_duplicates').notNull(),
    balanceColors:   boolean('balance_colors').notNull(),
    isFoil:          boolean('is_foil').notNull(),
    isFixed:         boolean('is_fixed').notNull(),
});

export const boosters = schema.table('boosters', {
    id: uuid('id').primaryKey().defaultRandom(),

    setId:     text('set_id').notNull(),
    boosterId: text('booster_id').notNull(),

    totalWeight: integer('total_weight').notNull(),
});

export const sets = schema.table('sets', {
    setId: text('set_id').primaryKey(),

    block:  text('block'),
    parent: text('parent'),

    printedSize: integer('printed_size'),
    cardCount:   integer('card_count').notNull(),
    langs:       text('langs').array().notNull(),
    rarities:    text('rarities').array().notNull(),

    type:            text('type').notNull(),
    isDigital:       integer('is_digital').notNull(),
    isFoilOnly:      integer('is_foil_only').notNull(),
    isNonfoilOnly:   integer('is_nonfoil_only').notNull(),
    symbolStyle:     text('symbol_style').array(),
    doubleFacedIcon: text('double_faced_icon').array(),

    releaseDate: text('release_date'),

    scryfallId:   uuid('scryfall_id').notNull(),
    scryfallCode: text('scryfall_code').notNull(),

    mtgoCode:    text('mtgo_code'),
    tcgPlayerId: integer('tcg_player_id'),
});
