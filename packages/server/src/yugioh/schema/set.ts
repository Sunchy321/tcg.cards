import { integer, primaryKey, text } from 'drizzle-orm/pg-core';
import { schema } from './schema';

import { fullLocale } from './card';

export const SetLocalization = schema.table('set_localizations', {
    setId: text('set_id').notNull(),
    lang:  text('lang').notNull(),

    name: text('name'),
}, table => [
    primaryKey({ columns: [table.setId, table.lang] }),
]);

export const Set = schema.table('sets', {
    setId: text('set_id').primaryKey(),

    cardCount: integer('card_count').notNull(),
    langs:     fullLocale('langs').array().notNull(),
    rarities:  text('rarities').array().notNull(),

    type: text('type').notNull(),

    releaseDate: text('release_date'),
});
