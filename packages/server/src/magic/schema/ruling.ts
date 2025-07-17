import { text, uuid } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const rulings = schema.table('rulings', {
    id: uuid().primaryKey().defaultRandom(),

    cardId:   text('card_id').notNull(),
    source:   text('source').notNull(),
    date:     text('date').notNull(),
    text:     text('text').notNull(),
    richText: text('rich_text').notNull(),
});
