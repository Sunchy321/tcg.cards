import { text, uuid } from 'drizzle-orm/pg-core';
import { schema } from './schema';

export const formatChanges = schema.table('format_changes', {
    id: uuid('id').primaryKey().defaultRandom(),

    source: text('source').notNull(),
    date:   text('date').notNull(),
    format: text('format').notNull(),

    links: text().array(),

    type:   text('type').notNull(),
    cardId: text('card_id').notNull(),
    setId:  text('set_id').notNull(),

    status: text('status').notNull(),
    group:  text('group'),
});
