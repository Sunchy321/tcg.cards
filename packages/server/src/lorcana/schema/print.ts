import { jsonb, text, integer } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Layout, Rarity } from '@model/lorcana/schema/basic';

export const Print = schema.table('prints', {
    cardId: text('card_id').notNull(),

    lang:   text('lang').notNull(),
    set:    text('set').notNull(),
    number: text('number').notNull(),

    name:     text('name').notNull(),
    typeline: text('typeline').notNull(),
    text:     text('text').notNull(),

    flavorText: text('flavor_text'),
    artist:     text('artist').notNull(),

    imageUri: jsonb('image_uri').$type<Record<string, string>>().notNull().default({}),

    tags: jsonb('tags').$type<string[]>().notNull().default([]),

    layout:      jsonb('layout').$type<Layout>().notNull(),
    rarity:      jsonb('rarity').$type<Rarity>().notNull(),
    releaseDate: text('release_date').notNull(),
    finishes:    jsonb('finishes').$type<string[]>(),

    id:           integer('id'),
    code:         text('code'),
    tcgPlayerId:  integer('tcg_player_id'),
    cardMarketId: integer('card_market_id'),
    cardTraderId: integer('card_trader_id'),
});
