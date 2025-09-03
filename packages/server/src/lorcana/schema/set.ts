import { jsonb, primaryKey, text, integer } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Rarity } from '@model/lorcana/schema/basic';

export const SetLocalization = schema.table('set_localizations', {
    setId: text('set_id').notNull(),
    lang:  text('lang').notNull(),

    name: text('name').notNull(),
}, table => [
    primaryKey({ columns: [table.setId, table.lang] }),
]);

export const Set = schema.table('sets', {
    setId:  text('set_id').primaryKey(),
    number: integer('number').notNull(),

    cardCount: integer('card_count').notNull(),
    langs:     jsonb('langs').$type<string[]>().notNull().default([]),
    rarities:  jsonb('rarities').$type<Rarity[]>().notNull().default([]),

    type: text('type').notNull(),

    releaseDate:    text('release_date').notNull(),
    prereleaseDate: text('prerelease_date').notNull(),

    lorcanaJsonId: text('lorcana_json_id').notNull(),
});
