import { integer, jsonb, primaryKey, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Card } from '@interface/hearthstone/card';

export const cardVersions = schema.table('card_versions', {
    cardId:  text('card_id').notNull(),
    version: integer('version').array().notNull(),

    change: text('change').notNull(),
}, table => [
    primaryKey({ columns: [table.cardId, table.version] }),
]);

export const cards = schema.table('cards', {
    cardId: text('card_id').primaryKey(),

    legalities: jsonb('legalities').$type<Card['legalities']>().default({}),
});
